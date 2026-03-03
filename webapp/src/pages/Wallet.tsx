import { useEffect, useState } from "react";
import { useWalletStore } from "../stores/useWalletStore";
import {
  Wallet as WalletIcon,
  ExternalLink,
  Copy,
  Check,
  LogOut,
} from "lucide-react";
import clsx from "clsx";

export const Wallet = () => {
  const {
    address,
    balanceEth,
    balanceUsdc,
    isWalletReady,
    isWalletLoading,
    externalAddress,
    externalBalanceEth,
    externalBalanceUsdc,
    isExternalConnected,
    useExternalWallet,
    connectExternalWallet,
    disconnectExternalWallet,
    setUseExternalWallet,
    initWallet,
    refreshBalances,
    error,
  } = useWalletStore();

  const [copiedLocal, setCopiedLocal] = useState(false);
  const [copiedExternal, setCopiedExternal] = useState(false);

  useEffect(() => {
    if (!isWalletReady && !isWalletLoading) {
      initWallet();
    }
  }, [isWalletReady, isWalletLoading, initWallet]);

  useEffect(() => {
    refreshBalances();
  }, [isExternalConnected]);

  const handleCopy = (text: string, isLocal: boolean) => {
    navigator.clipboard.writeText(text);
    if (isLocal) {
      setCopiedLocal(true);
      setTimeout(() => setCopiedLocal(false), 2000);
    } else {
      setCopiedExternal(true);
      setTimeout(() => setCopiedExternal(false), 2000);
    }
  };

  const formatAddr = (addr: string | null) => {
    if (!addr) return "";
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-20 p-6 md:p-0">
      <div className="flex items-center gap-4 border-b border-white/5 pb-6">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20">
          <WalletIcon size={32} className="text-white" />
        </div>
        <div>
          <h1 className="text-4xl font-black tracking-tight">Wallet</h1>
          <p className="opacity-60 text-lg">
            Manage your funds on Base Mainnet
          </p>
        </div>
      </div>

      {error && (
        <div className="alert alert-error shadow-lg">
          <div>
            <span>{error}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Local Wallet Card */}
        <div
          className={clsx(
            "card bg-base-100/50 border shadow-xl transition-all",
            !useExternalWallet
              ? "border-primary/50 shadow-primary/10"
              : "border-white/5 opacity-80",
          )}
        >
          <div className="card-body">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="card-title text-2xl">TuneCamp Wallet</h2>
                <span className="text-xs opacity-60">
                  Auto-generated local wallet
                </span>
              </div>
              <div className="badge badge-primary badge-outline">Local</div>
            </div>

            {isWalletLoading ? (
              <div className="animate-pulse space-y-4">
                <div className="h-8 bg-white/5 rounded w-1/2"></div>
                <div className="h-4 bg-white/5 rounded w-full"></div>
              </div>
            ) : !isWalletReady ? (
              <div className="text-center py-8 opacity-50">
                Local wallet not ready
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <div className="text-xs uppercase tracking-wider opacity-50 mb-1">
                    Balance
                  </div>
                  <div className="text-3xl font-bold font-mono text-primary flex items-baseline gap-2">
                    {parseFloat(balanceEth || "0").toFixed(4)}{" "}
                    <span className="text-base opacity-60">ETH</span>
                  </div>
                  {parseFloat(balanceUsdc || "0") > 0 && (
                    <div className="text-xl font-bold font-mono text-secondary flex items-baseline gap-2 mt-1">
                      {parseFloat(balanceUsdc || "0").toFixed(2)}{" "}
                      <span className="text-base opacity-60">USDC</span>
                    </div>
                  )}
                </div>

                <div className="bg-black/30 p-4 rounded-xl border border-white/5">
                  <div className="text-xs uppercase tracking-wider opacity-50 mb-2">
                    Address
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-mono text-sm opacity-80">
                      {formatAddr(address)}
                    </span>
                    <button
                      className="btn btn-sm btn-ghost btn-circle"
                      onClick={() => handleCopy(address || "", true)}
                      title="Copy Address"
                    >
                      {copiedLocal ? (
                        <Check size={16} className="text-success" />
                      ) : (
                        <Copy size={16} />
                      )}
                    </button>
                  </div>
                </div>

                <div className="card-actions mt-4">
                  <button
                    className={clsx(
                      "btn flex-1",
                      !useExternalWallet ? "btn-primary" : "btn-outline",
                    )}
                    onClick={() => setUseExternalWallet(false)}
                    disabled={!useExternalWallet && true}
                  >
                    {!useExternalWallet ? "Currently Active" : "Set as Default"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* External Wallet Card */}
        <div
          className={clsx(
            "card bg-base-100/50 border shadow-xl transition-all",
            useExternalWallet
              ? "border-secondary/50 shadow-secondary/10"
              : "border-white/5 opacity-80",
          )}
        >
          <div className="card-body">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="card-title text-2xl">MetaMask</h2>
                <span className="text-xs opacity-60">
                  External browser wallet
                </span>
              </div>
              <div className="badge badge-secondary badge-outline border-secondary/30">
                External
              </div>
            </div>

            {!isExternalConnected ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-4">
                <div className="w-16 h-16 rounded-full bg-secondary/10 flex items-center justify-center">
                  <ExternalLink size={24} className="text-secondary" />
                </div>
                <p className="text-center opacity-70">
                  Connect your external wallet to pay directly from MetaMask.
                </p>
                <button
                  className="btn btn-secondary mt-2 shadow-lg shadow-secondary/20"
                  onClick={connectExternalWallet}
                >
                  Connect MetaMask
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <div className="text-xs uppercase tracking-wider opacity-50 mb-1">
                    Balance
                  </div>
                  <div className="text-3xl font-bold font-mono text-secondary flex items-baseline gap-2">
                    {parseFloat(externalBalanceEth || "0").toFixed(4)}{" "}
                    <span className="text-base opacity-60">ETH</span>
                  </div>
                  {parseFloat(externalBalanceUsdc || "0") > 0 && (
                    <div className="text-xl font-bold font-mono text-primary flex items-baseline gap-2 mt-1">
                      {parseFloat(externalBalanceUsdc || "0").toFixed(2)}{" "}
                      <span className="text-base opacity-60">USDC</span>
                    </div>
                  )}
                </div>

                <div className="bg-black/30 p-4 rounded-xl border border-white/5">
                  <div className="text-xs uppercase tracking-wider opacity-50 mb-2">
                    Address
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-mono text-sm opacity-80">
                      {formatAddr(externalAddress)}
                    </span>
                    <button
                      className="btn btn-sm btn-ghost btn-circle"
                      onClick={() => handleCopy(externalAddress || "", false)}
                      title="Copy Address"
                    >
                      {copiedExternal ? (
                        <Check size={16} className="text-success" />
                      ) : (
                        <Copy size={16} />
                      )}
                    </button>
                  </div>
                </div>

                <div className="card-actions flex gap-2 mt-4">
                  <button
                    className={clsx(
                      "btn flex-1",
                      useExternalWallet ? "btn-secondary" : "btn-outline",
                    )}
                    onClick={() => setUseExternalWallet(true)}
                    disabled={useExternalWallet}
                  >
                    {useExternalWallet ? "Currently Active" : "Set as Default"}
                  </button>
                  <button
                    className="btn btn-ghost btn-square text-error hover:bg-error/20"
                    onClick={() => {
                      disconnectExternalWallet();
                      setUseExternalWallet(false);
                    }}
                    title="Disconnect"
                  >
                    <LogOut size={20} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-base-200/50 rounded-2xl p-6 border border-white/5">
        <h3 className="text-xl font-bold mb-2">How it works</h3>
        <p className="opacity-70 text-sm leading-relaxed max-w-2xl">
          TuneCamp automatically creates a highly secure local wallet for you
          using your account credentials, ensuring that your keys never leave
          your device. You can choose to fund this local wallet for seamless
          one-click purchases, or connect an external Web3 wallet like MetaMask
          to retain manual control over each transaction signature.
        </p>
      </div>
    </div>
  );
};
