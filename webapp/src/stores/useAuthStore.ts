import { create } from 'zustand';
import API from '../services/api';
import { GunAuth, type GunProfile } from '../services/gun';
import type { User } from '../types';
import { useWalletStore } from './useWalletStore';

type UserRole = 'admin' | 'user' | null;

interface AuthState {
    user: (User & { gunProfile?: GunProfile | null }) | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    isFirstRun: boolean;
    mustChangePassword?: boolean;
    role: UserRole;
    error: string | null;

    // Actions
    init: () => Promise<void>;
    login: (username: string, password?: string) => Promise<void>;
    register: (username: string, password: string) => Promise<void>;
    logout: () => void;
    checkAuth: () => Promise<void>;
    clearError: () => void;

    // Compatibility (for existing components)
    adminUser: User | null;
    isAdminAuthenticated: boolean;
    isAdminLoading: boolean;
    isInitializing: boolean;
    loginAdmin: (username: string, password?: string) => Promise<void>;
    loginWithPair: (pair: any) => Promise<void>;
    checkAdminAuth: () => Promise<void>;
    logoutAdmin: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    isFirstRun: false,
    mustChangePassword: false,
    role: null,
    error: null,

    // Compat helpers
    adminUser: null,
    isAdminAuthenticated: false,
    isAdminLoading: true,
    isInitializing: true,

    clearError: () => set({ error: null }),

    init: async () => {
        set({ isLoading: true });
        await get().checkAuth();
    },

    checkAuth: async () => {
        set({ isLoading: true });
        try {
            const status = await API.getAuthStatus();
            const isAdmin = status.authenticated && status.role === 'admin';
            
            let gunProfile: GunProfile | null = null;
            if (status.pair) {
                try {
                    gunProfile = await GunAuth.loginWithPair(status.pair);
                } catch (e) {
                    console.error("GunDB re-auth failed:", e);
                }
            } else if (status.authenticated) {
                // Try session storage or init
                try {
                    await GunAuth.init();
                    gunProfile = GunAuth.getProfile();
                } catch (e) {}
            }

            const transformedUser = status.user || (status.username ? { 
                username: status.username, 
                isAdmin: status.role === 'admin', 
                id: String(status.artistId || '0'), 
                artistId: String(status.artistId) 
            } as User : null);

            set({
                isAuthenticated: status.authenticated,
                isAdminAuthenticated: isAdmin, // compat
                user: transformedUser ? { ...transformedUser, gunProfile } : null,
                adminUser: transformedUser, // compat
                isFirstRun: !!status.firstRun,
                mustChangePassword: !!status.mustChangePassword,
                role: (status.role as any) || null,
                isLoading: false,
                isAdminLoading: false, // compat
                isInitializing: false // compat
            });
        } catch (e) {
            set({ 
                isAuthenticated: false, 
                isAdminAuthenticated: false, 
                user: null, 
                adminUser: null, 
                isLoading: false, 
                isAdminLoading: false,
                isInitializing: false,
                isFirstRun: false, 
                role: null 
            });
        }
    },

    login: async (username, password) => {
        set({ error: null, isLoading: true });
        try {
            let pubKey: string | undefined;
            let proof: string | undefined;

            if (password) {
                try {
                    console.log("🔐 GunDB-First Login: Verifying identity on peer network...");
                    const gunProfile = await GunAuth.login(username, password);
                    pubKey = gunProfile.pub;
                    
                    // Generate proof-of-possession for the backend
                    // We sign the username to prove we own the pubKey
                    proof = await GunAuth.sign(username);
                    console.log("✨ Proof of identity generated.");
                } catch (gunErr) {
                    console.warn("⚠️ GunDB authentication failed (maybe offline or wrong pass), falling back to local-only proof:", gunErr);
                }
            }

            const result = await API.login(username, password, pubKey, proof);
            API.setToken(result.token);

            let gunProfile: GunProfile | null = null;
            if (result.pair) {
                try {
                    gunProfile = await GunAuth.loginWithPair(result.pair);
                } catch (gunErr) {
                    console.error("Failed to auto-login to GunDB with pair:", gunErr);
                }
            }

            if (gunProfile) {
                try {
                    // Subscribe to profile changes
                    GunAuth.subscribeProfile((profileData) => {
                        set((state) => ({
                            user: state.user ? { ...state.user, gunProfile: { ...state.user.gunProfile!, profile: profileData } } : null
                        }));
                    });

                    // Subscribe to mutable alias changes
                    GunAuth.subscribeAlias((aliasData) => {
                        if (aliasData) {
                            set((state) => ({
                                user: state.user ? { ...state.user, gunProfile: { ...state.user.gunProfile!, alias: aliasData } } : null
                            }));
                        }
                    });
                } catch (subErr) {
                    console.error("Failed to subscribe to GunDB info:", subErr);
                }
            }

            const transformedUser = result.user || { 
                username, 
                isAdmin: result.role === 'admin', 
                id: String(result.artistId || '0'),
                artistId: String(result.artistId)
            } as User;

            const userRole = (result as any).role || 'user';
            set({
                isAuthenticated: true,
                isAdminAuthenticated: userRole === 'admin', // compat
                user: { ...transformedUser, gunProfile },
                adminUser: transformedUser, // compat
                mustChangePassword: !!result.mustChangePassword,
                role: userRole,
                isLoading: false,
                isAdminLoading: false, // compat
                isInitializing: false // compat
            });
        } catch (e: any) {
            set({ error: e.message, isLoading: false });
            throw e;
        }
    },

    // Compat alias
    loginAdmin: async (username, password) => {
        return get().login(username, password);
    },

    loginWithPair: async (pair: any) => {
        set({ error: null, isLoading: true, isAdminLoading: true, isInitializing: true });
        try {
            console.log("🔐 GunDB-First Login: Verifying identity on peer network using Gun Pair...");
            const gunProfile = await GunAuth.loginWithPair(pair);
            
            let proof: string | undefined;
            try {
                // Generate proof-of-possession for the backend
                // The username (alias) acts as the payload to sign
                const username = gunProfile.alias;
                proof = await GunAuth.sign(username);
                console.log("✨ Proof of identity generated from Pair.");
                
                // Now authenticate with backend API using the proof
                // The backend API login expects a username + password OR a valid pubKey + proof.
                // Depending on the backend implementation, sending the alias + pubKey + proof might be enough
                // to authenticate without the actual password. Let's try sending alias and empty password, plus PubKey/Proof.
                const result = await API.login(username, '', gunProfile.pub, proof);
                API.setToken(result.token);

                // Update the user structure with the result from the backend
                const transformedUser = result.user || { 
                    username, 
                    isAdmin: result.role === 'admin', 
                    id: String(result.artistId || '0'),
                    artistId: String(result.artistId)
                } as User;
                
                const userRole = (result as any).role || 'user';
                
                // Subscribe to profile changes
                try {
                    GunAuth.subscribeProfile((profileData) => {
                        set((state) => ({
                            user: state.user ? { ...state.user, gunProfile: { ...state.user.gunProfile!, profile: profileData } } : null
                        }));
                    });

                    // Subscribe to mutable alias changes
                    GunAuth.subscribeAlias((aliasData) => {
                        if (aliasData) {
                            set((state) => ({
                                user: state.user ? { ...state.user, gunProfile: { ...state.user.gunProfile!, alias: aliasData } } : null
                            }));
                        }
                    });
                } catch (subErr) {
                    console.error("Failed to subscribe to GunDB profile:", subErr);
                }

                set({
                    isAuthenticated: true,
                    isAdminAuthenticated: userRole === 'admin',
                    user: { ...transformedUser, gunProfile },
                    adminUser: transformedUser,
                    mustChangePassword: !!result.mustChangePassword,
                    role: userRole,
                    isLoading: false,
                    isAdminLoading: false,
                    isInitializing: false
                });

            } catch (backendError) {
                console.warn("Backend authentication failed after Pair login. Proceeding with local GunDB session only.", backendError);
                // Fallback to local session if backend integration fails
                set((state) => ({ 
                    user: state.user ? { ...state.user, gunProfile } : { gunProfile } as any,
                    isAuthenticated: true,
                    isLoading: false,
                    isAdminLoading: false,
                    isInitializing: false
                }));
            }
        } catch (e: any) {
            set({ error: e.message, isLoading: false, isAdminLoading: false, isInitializing: false });
            throw e;
        }
    },

    checkAdminAuth: async () => {
        return get().checkAuth();
    },

    logoutAdmin: () => {
        get().logout();
    },

    register: async (username, password) => {
        set({ error: null, isLoading: true });
        try {
            // 1. Register on GunDB first (Decentralized Identity)
            console.log("🆕 GunDB-First Registration: Creating identity on peer network...");
            await GunAuth.register(username, password);
            const gunProfile = GunAuth.getProfile();
            
            if (!gunProfile) throw new Error("Failed to create GunDB identity");

            // 2. Generate proof for backend
            const proof = await GunAuth.sign(username);

            // 3. Register on backend with proof
            const result = await API.registerUser(username, password, gunProfile.pub, proof);
            
            // 4. Auto-login with the JWT token
            API.setToken(result.token);

            // 5. Success - updates the store state
            await get().checkAuth();

            set({ isLoading: false });
        } catch (e: any) {
            set({ error: e.message, isLoading: false });
            throw e;
        }
    },

    logout: () => {
        GunAuth.logout();
        useWalletStore.getState().clearWallet();
        API.setToken(null);
        set({ 
            user: null, 
            isAuthenticated: false, 
            adminUser: null, 
            isAdminAuthenticated: false, 
            isAdminLoading: false,
            isInitializing: false,
            role: null 
        });
    }
}));
