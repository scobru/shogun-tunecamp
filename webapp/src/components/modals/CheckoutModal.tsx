import { useEffect, useState } from "react";
import { useWalletStore } from "../../stores/useWalletStore";
import { GunAuth } from "../../services/gun";
import { Wallet, Loader2, CheckCircle2, Download } from "lucide-react";
import { ethers } from "ethers";
// @ts-expect-error
import { TuneCampCheckout, TokenRole } from "shogun-contracts-sdk";

// Track type matching minimum required for checkout
interface CheckoutTrack {
  id: string;
  title: string;
  artist: string;
  priceEth?: string;
  price?: number;
  currency?: "ETH" | "USD";
  albumId?: number | string;
  album_id?: number | string;
  walletAddress?: string;
}

export const CheckoutModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [track, setTrack] = useState<CheckoutTrack | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [unlockCode, setUnlockCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usdRate, setUsdRate] = useState<number | null>(null);
  const [isLoadingRate, setIsLoadingRate] = useState(false);

  const {
    wallet,
    balanceEth,
    isWalletReady,
    externalWallet,
    externalBalanceEth,
    isExternalConnected,
    useExternalWallet,
  } = useWalletStore();

  useEffect(() => {
    const handleOpen = async (e: any) => {
      const t = e.detail.track as CheckoutTrack;
      setTrack(t);
      setIsOpen(true);
      setTxHash(null);
      setUnlockCode(null);
      setError(null);
      setIsProcessing(false);

      if (t.currency === "USD") {
        setIsLoadingRate(true);
        try {
          const res = await fetch("/api/payments/rate/USD");
          const data = await res.json();
          if (data.rate) setUsdRate(data.rate);
        } catch (e) {
          console.error("Failed to fetch USD rate", e);
        } finally {
          setIsLoadingRate(false);
        }
      } else {
        setUsdRate(null);
      }
    };
    window.addEventListener("open-checkout-modal", handleOpen);
    return () => window.removeEventListener("open-checkout-modal", handleOpen);
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    setTrack(null);
    setTimeout(() => {
      setTxHash(null);
      setUnlockCode(null);
      setError(null);
    }, 300);
  };

  const handleDownload = () => {
    if (!track || !unlockCode) return;
    window.open(
      `/api/payments/download/${track.id}?code=${unlockCode}`,
      "_blank",
    );
    handleClose();
  };

  const handlePurchase = async () => {
    if (useExternalWallet && !externalWallet) {
      setError("MetaMask selected but not connected.");
      return;
    }
    if (!useExternalWallet && !wallet) {
      setError("Local wallet not ready.");
      return;
    }
    if (!track) return;

    let finalPriceEth = track.priceEth;

    if (track.currency === "USD" && track.price) {
      if (!usdRate) {
        setError("Could not determine ETH price for USD amount.");
        return;
      }
      finalPriceEth = (track.price / usdRate).toFixed(6);
    }

    if (!finalPriceEth || parseFloat(finalPriceEth) <= 0) {
      setError("Invalid price.");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const checkoutAddr = (window as any).TUNECAMP_CONFIG?.web3_checkout_address;
      
      if (!checkoutAddr) throw new Error("Web3 Checkout contract not configured on this store. Contact the admin.");

      const activeSigner = useExternalWallet ? externalWallet! : wallet!;
      const network = await activeSigner.provider!.getNetwork();
      const checkout = new TuneCampCheckout(activeSigner.provider as any, activeSigner as any, Number(network.chainId)).attach(checkoutAddr);
      
      const trackIdBigInt = BigInt(track.id);
      const value = ethers.parseEther(finalPriceEth);
      // Assuming role 0 is LISTENER
      const role = TokenRole?.LISTENER || 0;
      
      const tx = await checkout.purchaseWithETH(trackIdBigInt, role, 1, value);

      const receipt = await tx.wait();

      if (!receipt || receipt.status === 0) {
        throw new Error("Transaction failed on-chain.");
      }

      let code: string | undefined;
      try {
        const verifyRes = await fetch("/api/payments/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            txHash: receipt.hash,
            trackId: track.id,
          }),
        });
        const verifyData = await verifyRes.json();
        if (verifyData.success && verifyData.code) {
          code = verifyData.code;
          setUnlockCode(code ?? null);
        }
      } catch (verifyErr) {
        console.warn(
          "Payment verification failed, purchase still recorded:",
          verifyErr,
        );
      }

      const user = GunAuth.user;
      if (user.is) {
        // @ts-ignore
        user
          .get("purchases")
          .get(track.id)
          .put({
            txid: receipt.hash,
            date: Date.now(),
            price: finalPriceEth,
            code: code || "",
          });
      }

      setTxHash(receipt.hash);
    } catch (err: any) {
      console.error("Purchase failed:", err);
      setError(err.message || "Transaction failed");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen || !track) return null;

  let displayPriceEth = track.priceEth || "0";
  if (track.currency === "USD" && track.price && usdRate) {
    displayPriceEth = (track.price / usdRate).toFixed(6);
  } else if (!track.priceEth && track.price) {
    displayPriceEth = String(track.price);
  }

  const activeBalance = useExternalWallet ? externalBalanceEth : balanceEth;
  const hasEnoughBalance =
    parseFloat(activeBalance || "0") >= parseFloat(displayPriceEth);
  const isReady = useExternalWallet ? isExternalConnected : isWalletReady;
  const activeWalletLabel = useExternalWallet ? "MetaMask" : "Local Wallet";

  return (
    <div
      className={`modal ${isOpen ? "modal-open" : ""} bg-black/60 backdrop-blur-sm`}
    >
      <div className="modal-box bg-base-100/80 backdrop-blur-2xl border border-white/10 shadow-[0_0_40px_rgba(var(--color-primary),0.15)] rounded-3xl p-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-secondary to-accent"></div>
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-primary/20 blur-[80px] rounded-full pointer-events-none"></div>

        <div className="relative z-10 flex flex-col items-center text-center">
          {txHash ? (
            <>
              <div className="w-20 h-20 rounded-full bg-success/20 flex items-center justify-center mb-6 text-success animate-bounce">
                <CheckCircle2 size={40} />
              </div>
              <h3 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70 mb-2">
                Purchase Successful!
              </h3>
              <p className="text-white/60 mb-6 font-medium">
                "{track.title}" by {track.artist} has been added to your
                collection.
              </p>
              <div className="bg-black/40 rounded-xl p-4 w-full mb-8 border border-white/5 break-all text-left">
                <span className="text-xs text-white/40 uppercase tracking-wider block mb-1">
                  Transaction Hash
                </span>
                <a
                  href={`https://basescan.org/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-primary hover:underline font-mono"
                >
                  {txHash}
                </a>
              </div>
              {unlockCode ? (
                <button
                  className="btn btn-primary btn-lg w-full rounded-2xl gap-2"
                  onClick={handleDownload}
                >
                  <Download size={20} />
                  Download Track
                </button>
              ) : (
                <button
                  className="btn btn-primary btn-lg w-full rounded-2xl"
                  onClick={handleClose}
                >
                  Start Listening
                </button>
              )}
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center mb-6 shadow-xl shadow-primary/20 transform rotate-3">
                <Wallet size={32} className="text-white transform -rotate-3" />
              </div>

              <h3 className="text-2xl font-bold mb-2">Unlock Track</h3>
              <p className="text-white/70 mb-8 max-w-sm">
                Support <strong className="text-white">{track.artist}</strong>{" "}
                directly. This transaction runs on Base Mainnet.
              </p>

              <div className="w-full bg-black/40 rounded-2xl p-5 mb-2 border border-white/5">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-white/60">Item</span>
                  <span className="font-semibold">{track.title}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/60">Price</span>
                  <div className="flex flex-col text-right">
                    <span className="text-xl font-bold text-primary">
                      {track.currency === "USD" && track.price
                        ? `$${track.price.toFixed(2)}`
                        : `${displayPriceEth} ETH`}
                    </span>
                    {track.currency === "USD" && usdRate && (
                      <span className="text-xs opacity-50">
                        ≈ {displayPriceEth} ETH
                      </span>
                    )}
                    {isLoadingRate && (
                      <span className="text-xs opacity-50 italic">
                        Calculating ETH...
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center mb-6 text-sm opacity-70 w-full px-1">
                <span>Paying with:</span>
                <span className="font-semibold text-white">
                  {activeWalletLabel}
                </span>
              </div>

              {!hasEnoughBalance && !txHash && (
                <p className="text-error text-sm mb-4">
                  Insufficient ETH balance in {activeWalletLabel}.
                </p>
              )}

              {error && (
                <p className="text-error text-sm mb-4 bg-error/10 p-3 rounded-xl border border-error/20 w-full text-left">
                  {error}
                </p>
              )}

              <div className="modal-action w-full mt-6 space-x-3">
                <button
                  className="btn btn-ghost rounded-xl flex-1 border border-white/10 hover:bg-white/5"
                  onClick={handleClose}
                  disabled={isProcessing}
                >
                  Cancel
                </button>

                <button
                  className="btn btn-primary rounded-xl flex-1 shadow-lg shadow-primary/20"
                  onClick={handlePurchase}
                  disabled={!isReady || isProcessing || !hasEnoughBalance}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="animate-spin" size={18} />{" "}
                      Processing...
                    </>
                  ) : (
                    `Pay ${displayPriceEth} ETH`
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <label
        className="modal-backdrop"
        onClick={!isProcessing ? handleClose : undefined}
      >
        Close
      </label>
    </div>
  );
};
