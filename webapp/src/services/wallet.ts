import { ethers } from 'ethers';


// Base Mainnet RPC configuration
const BASE_RPC_URL = (window as any).TUNECAMP_CONFIG?.rpcUrl || import.meta.env.VITE_TUNECAMP_RPC_URL || 'https://mainnet.base.org';

const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);

/**
 * Derives an Ethereum wallet from the user's GunDB SEA credentials.
 * This happens purely on the client-side. The private key never leaves the browser.
 *
 * @param userSEA The secret 'priv' key from the user's SEA pair.
 * @returns The instantiated ethers Wallet connected to Base Mainnet.
 */
export async function deriveTunecampWallet(userPrivStr: string) {
    if (!userPrivStr) throw new Error("Missing user private key");

    // The 'priv' field in SEA is a string that represents the private key.
    // In Gun SEA, it might need to be hashed or padded, but usually 'priv' is a derived secret.
    // Ethers expects a 32-byte (64-character hex) string prefixed with '0x'.
    // If the SEA priv is not exactly 64 hex chars, we hash it to create a deterministic valid private key.

    let privateKeyHex = userPrivStr;
    if (!privateKeyHex.startsWith('0x')) {
        privateKeyHex = `0x${privateKeyHex}`;
    }

    // Ensure it's 32 bytes. If not, we hash it.
    if (privateKeyHex.length !== 66) {
        // Hash the SEA priv string to deterministically get a 32-byte hash
        privateKeyHex = ethers.id(userPrivStr);
    }

    // Connect wallet to provider
    const wallet = new ethers.Wallet(privateKeyHex, provider);

    return wallet;
}

export const WalletService = {
    provider
};
