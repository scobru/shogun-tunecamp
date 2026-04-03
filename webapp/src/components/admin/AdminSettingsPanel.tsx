import { useState, useEffect } from "react";
import API from "../../services/api";
import { Save, CheckCircle2 } from "lucide-react";
import type { SiteSettings } from "../../types";
import { useWalletStore } from "../../stores/useWalletStore";
import { TuneCampFactory } from "shogun-contracts-sdk";

export const AdminSettingsPanel = () => {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const { wallet, externalWallet, useExternalWallet, isExternalConnected, isWalletReady } = useWalletStore();
  const activeSigner = useExternalWallet ? externalWallet : wallet;
  const isReady = useExternalWallet ? isExternalConnected : isWalletReady;

  const [isCheckingOnChain, setIsCheckingOnChain] = useState(false);
  const [hasOnChainInstance, setHasOnChainInstance] = useState(false);

  const handleDeploy = async () => {
    if (!activeSigner || !isReady) {
      setMessage("Failed: Wallet not connected or not ready.");
      return;
    }
    setLoading(true);
    setMessage("Deploying Web3 Store... Please confirm transaction in your wallet.");

    try {
      // Find factory address for Base mainnet (chainId: 8453)
      const network = await activeSigner.provider!.getNetwork();
      const chainId = Number(network.chainId);

      const factory = new TuneCampFactory(activeSigner.provider as any, activeSigner as any, chainId);
      const instanceName = settings?.siteName || "TuneCamp";
      const baseURI = settings?.publicUrl ? `${settings.publicUrl}/api/nft/` : "https://tunecamp.app/api/nft/";

      // Treasury is the platform fee collector (could be actual TuneCamp platform wallet or admin for now)
      const adminAddress = await activeSigner.getAddress();
      const treasury = adminAddress; // Or specify a global platform wallet here

      const tx = await factory.deployInstance(instanceName, baseURI, treasury);
      setMessage("Transaction sent! Waiting for confirmation...");

      const receipt = await tx.wait();

      if (!receipt) throw new Error("Transaction failed or no receipt");

      let checkoutAddr = "";
      let nftAddr = "";

      for (const log of receipt.logs) {
        try {
          // @ts-ignore
          const parsed = factory.contract.interface.parseLog(log);
          if (parsed && parsed.name === "InstanceDeployed") {
            checkoutAddr = parsed.args.checkout;
            nftAddr = parsed.args.nft;
          }
        } catch (e) {
          // Ignore logs that can't be parsed by this interface
        }
      }

      if (checkoutAddr && nftAddr) {
        setSettings(prev => prev ? ({ ...prev, web3_checkout_address: checkoutAddr, web3_nft_address: nftAddr }) : null);
        setMessage("Store deployed successfully! Please click Save Changes.");
      } else {
        setMessage("Transaction confirmed! Please manually find the contract addresses from the transaction on BaseScan if they aren't shown, then save.");
      }

    } catch (e: any) {
      console.error(e);
      setMessage(`Deployment failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    API.getSiteSettings().then(setSettings).catch(console.error);
  }, []);

  useEffect(() => {
    const checkFactory = async () => {
      if (!activeSigner || !isReady || !settings) return;

      try {
        setIsCheckingOnChain(true);
        const network = await activeSigner.provider!.getNetwork();
        const chainId = Number(network.chainId);

        // This will throw if the SDK doesn't support the chainId. We catch and ignore.
        const factory = new TuneCampFactory(activeSigner.provider as any, activeSigner as any, chainId);

        const address = await activeSigner.getAddress();
        const instances = await factory.instancesOf(address);

        if (instances && instances.length > 0) {
          setHasOnChainInstance(true);

          if (!settings.web3_checkout_address || !settings.web3_nft_address) {
            const firstInstanceId = instances[0];
            const instanceData = await factory.getInstance(firstInstanceId);
            setSettings(prev => prev ? ({
                ...prev,
                web3_checkout_address: instanceData.checkout,
                web3_nft_address: instanceData.nft
            }) : null);
            setMessage("Found existing on-chain store! Addresses have been auto-filled. Please save changes.");
          }
        } else {
          setHasOnChainInstance(false);
        }
      } catch (e) {
        // Will throw quietly if not connected to a supported chain or if factory not found
      } finally {
        setIsCheckingOnChain(false);
      }
    };

    checkFactory();
  }, [activeSigner, isReady, settings !== null]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setLoading(true);
    setMessage("");
    try {
      const settingsToSave = {
        ...settings,
        web3_checkout_address: settings.web3_checkout_address || "",
        web3_nft_address: settings.web3_nft_address || "",
      };
      await API.updateSettings(settingsToSave);

      if (bgFile) {
        await API.uploadBackgroundImage(bgFile);
      }
      if (coverFile) {
        await API.uploadSiteCover(coverFile);
      }

      setMessage("Settings saved successfully.");
      setBgFile(null);
      setCoverFile(null);
      // Refresh settings to get new bg url if needed
      API.getSiteSettings().then(setSettings);
    } catch (e) {
      console.error(e);
      setMessage("Failed to save settings.");
    } finally {
      setLoading(false);
    }
  };

  if (!settings)
    return (
      <div className="p-8 text-center opacity-50">Loading settings...</div>
    );

  const hasDeployedStore = !!(settings.web3_checkout_address && settings.web3_nft_address) || hasOnChainInstance;
  const checkoutAddress = settings.web3_checkout_address || "";
  const nftAddress = settings.web3_nft_address || "";

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-2xl">
      <h3 className="font-bold text-lg">Site Settings</h3>

      <div className="form-control">
        <label className="label">
          <span className="label-text">Site Name</span>
        </label>
        <input
          type="text"
          className="input input-bordered"
          value={settings.siteName}
          onChange={(e) =>
            setSettings({ ...settings, siteName: e.target.value })
          }
        />
      </div>

      <div className="form-control">
        <label className="label">
          <span className="label-text">Description</span>
        </label>
        <textarea
          className="textarea textarea-bordered h-24"
          value={settings.siteDescription || ""}
          onChange={(e) =>
            setSettings({ ...settings, siteDescription: e.target.value })
          }
        />
      </div>

      <div className="form-control">
        <label className="label">
          <span className="label-text">
            Public URL (for ActivityPub & GunDB)
          </span>
          <span className="label-text-alt opacity-50">
            Example: https://sudorecords.scobrudot.dev
          </span>
        </label>
        <input
          type="url"
          className="input input-bordered"
          value={settings.publicUrl || ""}
          onChange={(e) =>
            setSettings({ ...settings, publicUrl: e.target.value })
          }
          placeholder="https://your-site.com"
        />
      </div>

      <div className="form-control">
        <label className="label">
          <span className="label-text">
            GunDB Peers (Comma separated)
          </span>
          <span className="label-text-alt opacity-50">
            Leave empty for defaults
          </span>
        </label>
        <textarea
          className="textarea textarea-bordered h-20"
          value={settings.gunPeers || ""}
          onChange={(e) =>
            setSettings({ ...settings, gunPeers: e.target.value })
          }
          placeholder="https://peer1.com/gun, https://peer2.com/gun"
        />
      </div>

      <div className="form-control">
        <label className="label">
          <span className="label-text">Background Image URL</span>
        </label>
        <input
          type="text"
          className="input input-bordered"
          value={settings.backgroundImage || ""}
          onChange={(e) =>
            setSettings({ ...settings, backgroundImage: e.target.value })
          }
          placeholder="/images/bg.jpg"
        />
      </div>

      <div className="form-control">
        <label className="label">
          <span className="label-text">Upload Background</span>
        </label>
        <input
          type="file"
          className="file-input file-input-bordered w-full"
          accept="image/*"
          onChange={(e) => setBgFile(e.target.files ? e.target.files[0] : null)}
        />
      </div>

      <div className="form-control">
        <label className="label">
          <span className="label-text">Site Cover (Network List Image)</span>
          <span className="label-text-alt opacity-50">
            Displayed on other nodes
          </span>
        </label>
        <input
          type="file"
          className="file-input file-input-bordered w-full"
          accept="image/*"
          onChange={(e) =>
            setCoverFile(e.target.files ? e.target.files[0] : null)
          }
        />
      </div>

      <div className="form-control">
        <label className="label cursor-pointer justify-start gap-4">
          <span className="label-text">Allow Public Registration</span>
          <input
            type="checkbox"
            className="toggle toggle-primary"
            checked={settings.allowPublicRegistration || false}
            onChange={(e) =>
              setSettings({
                ...settings,
                allowPublicRegistration: e.target.checked,
              })
            }
          />
        </label>
      </div>

      <div className="pt-4 space-y-4">
        <h4 className="font-bold border-b border-white/10 pb-2">Web3 Store Configuration</h4>
        <div className="form-control">
          <label className="label">
            <span className="label-text">Checkout Contract Address</span>
            <span className="label-text-alt opacity-50">Deployed TuneCampCheckout address</span>
          </label>
          <input
            type="text"
            className="input input-bordered font-mono text-sm"
            value={settings.web3_checkout_address !== undefined ? settings.web3_checkout_address : checkoutAddress}
            onChange={(e) =>
              setSettings({ ...settings, web3_checkout_address: e.target.value })
            }
            placeholder="0x..."
          />
        </div>
        <div className="form-control">
          <label className="label">
            <span className="label-text">NFT Contract Address</span>
            <span className="label-text-alt opacity-50">Deployed TuneCampNFT address</span>
          </label>
          <input
            type="text"
            className="input input-bordered font-mono text-sm"
            value={settings.web3_nft_address !== undefined ? settings.web3_nft_address : nftAddress}
            onChange={(e) =>
              setSettings({ ...settings, web3_nft_address: e.target.value })
            }
            placeholder="0x..."
          />
        </div>

        {hasDeployedStore ? (
          <div className="alert alert-success bg-success/20 border border-success/30 text-success-content mt-4 rounded-xl">
            <CheckCircle2 className="shrink-0" />
            <span>Store is currently active with configured contracts.</span>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-secondary w-full"
            onClick={handleDeploy}
            disabled={loading || !isReady || isCheckingOnChain}
          >
            {loading ? "Deploying..." : isCheckingOnChain ? "Checking chain..." : "Deploy New Store Instance"}
          </button>
        )}
      </div>

      <div className="pt-4">
        {message && (
          <div
            className={`mb-4 text-sm ${message.includes("Failed") ? "text-error" : "text-success"}`}
          >
            {message}
          </div>
        )}

        <div className="flex gap-4">
          <button
            type="submit"
            className="btn btn-primary gap-2 flex-1"
            disabled={loading}
          >
            <Save size={16} /> Save Changes
          </button>
        </div>
      </div>
    </form>
  );
};
