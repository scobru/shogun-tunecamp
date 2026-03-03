import { create } from 'zustand';
import { ethers } from 'ethers';
import { deriveTunecampWallet, WalletService } from '../services/wallet';
import { GunAuth } from '../services/gun';

interface WalletState {
    wallet: ethers.Wallet | null;
    address: string | null;
    balanceEth: string | null;
    balanceUsdc: string | null;
    isWalletReady: boolean;
    isWalletLoading: boolean;
    error: string | null;

    initWallet: () => Promise<void>;
    refreshBalances: () => Promise<void>;
    clearWallet: () => void;
}

// USDC Contract on Base Mainnet
const USDC_ADDRESS = import.meta.env.VITE_TUNECAMP_CURRENCY_CONTRACT || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// Minimal ERC20 ABI for balance checking
const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)"
];

export const useWalletStore = create<WalletState>((set, get) => ({
    wallet: null,
    address: null,
    balanceEth: null,
    balanceUsdc: null,
    isWalletReady: false,
    isWalletLoading: false,
    error: null,

    initWallet: async () => {
        set({ isWalletLoading: true, error: null });
        try {
            // Need to get the authenticated user's SEA 'priv' key to derive the wallet.
            // GunAuth doesn't expose SEA directly in the profile, but we can access `GunAuth.user._.sea.priv` 
            // if we use a helper or access it directly.

            // @ts-ignore
            const sea = GunAuth.user._.sea;

            if (!sea || !sea.priv) {
                console.log("No SEA credentials found. Wallet cannot be derived.");
                set({ isWalletLoading: false, isWalletReady: false });
                return;
            }

            const wallet = await deriveTunecampWallet(sea.priv);

            set({
                wallet,
                address: wallet.address,
                isWalletReady: true
            });

            // Fetch balances after initializing
            await get().refreshBalances();
        } catch (e: any) {
            console.error("Failed to initialize wallet:", e);
            set({ error: e.message, isWalletReady: false });
        } finally {
            set({ isWalletLoading: false });
        }
    },

    refreshBalances: async () => {
        const { wallet, address } = get();
        if (!wallet || !address) return;

        try {
            // Get ETH Balance
            const ethBalanceWei = await WalletService.provider.getBalance(address);
            const balanceEth = ethers.formatEther(ethBalanceWei);

            // Get USDC Balance
            const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, WalletService.provider);
            const usdcBalanceWei = await usdcContract.balanceOf(address);
            const decimals = await usdcContract.decimals();
            const balanceUsdc = ethers.formatUnits(usdcBalanceWei, decimals);

            set({ balanceEth, balanceUsdc });
        } catch (e: any) {
            console.error("Failed to fetch balances:", e);
        }
    },

    clearWallet: () => {
        set({
            wallet: null,
            address: null,
            balanceEth: null,
            balanceUsdc: null,
            isWalletReady: false,
            error: null
        });
    }
}));
