/**
 * Tunecamp Wallet Service
 *
 * Derives a deterministic Ethereum wallet from the user's GunDB SEA pair
 * using the canonical `gun/lib/wallet` derivation scheme (v1):
 *
 *   SEA.priv (P-256 scalar, base62) -> HKDF-SHA256 -> secp256k1 -> ETH address
 *
 * The private key NEVER leaves the browser. Derivation is pure client-side.
 * The scheme is versioned (v1) and reproducible across any GunDB instance.
 */
import { ethers } from 'ethers';
// @ts-ignore - gun/lib/wallet is registered by gun service but we can also use directly
import { seaToEthWallet } from 'gun/lib/wallet.js';

// Base Mainnet RPC configuration
const BASE_RPC_URL = (window as any).TUNECAMP_CONFIG?.rpcUrl || import.meta.env.VITE_TUNECAMP_RPC_URL || 'https://base.llamarpc.com';

const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);

/**
 * Derives an Ethereum wallet from the user's GunDB SEA pair.
 * Uses HKDF-SHA256 domain-separated derivation (SEA Wallet v1).
 *
 * @param pair The full SEA pair (must have `priv` field).
 * @param account Optional account index for HD-style multiple wallets (default: 0).
 * @returns The instantiated ethers Wallet connected to Base Mainnet.
 */
export async function deriveTunecampWallet(pair: { priv: string, [key: string]: any }, account = 0): Promise<ethers.Wallet> {
  if (!pair || !pair.priv) throw new Error("Missing SEA pair.priv");

  const { privateKey } = await seaToEthWallet(pair, { account });
  
  // Connect wallet to provider
  const wallet = new ethers.Wallet(privateKey, provider);

  return wallet;
}

/**
 * Convenience overload: derive from a raw priv string (legacy support).
 * Constructs a minimal pair object and calls the main derivation.
 *
 * @deprecated Pass the full SEA pair instead.
 */
export async function deriveTunecampWalletFromPriv(userPrivStr: string): Promise<ethers.Wallet> {
  if (!userPrivStr) throw new Error("Missing user private key");
  return deriveTunecampWallet({ priv: userPrivStr });
}

export const WalletService = {
  provider,
  getChainId: async (): Promise<number> => {
    try {
      const network = await provider.getNetwork();
      return Number(network.chainId);
    } catch (e) {
      console.warn("Failed to get connected network, defaulting to Base Mainnet.", e);
      return 8453;
    }
  },
  getUsdcBalance: async (address: string): Promise<bigint> => {
    const USDC_ADDRESS = import.meta.env.VITE_TUNECAMP_CURRENCY_CONTRACT || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // Configured or Base Mainnet USDC
    const abi = ["function balanceOf(address) view returns (uint256)"];
    const contract = new ethers.Contract(USDC_ADDRESS, abi, provider);
    try {
      return await contract.balanceOf(address);
    } catch (e) {
      console.error("USDC Balance Fetch Error:", e);
      return BigInt(0);
    }
  }
};
