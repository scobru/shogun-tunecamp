import { create } from 'zustand';
import API from '../services/api';
import { GunAuth, type GunProfile } from '../services/gun';
import type { User } from '../types';

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
            const result = await API.login(username, password);
            API.setToken(result.token);

            let gunProfile: GunProfile | null = null;
            if (result.pair) {
                try {
                    gunProfile = await GunAuth.loginWithPair(result.pair);
                } catch (gunErr) {
                    console.error("Failed to auto-login to GunDB with pair:", gunErr);
                }
            } else if (password) {
                // Fallback: Use password to derive identity if pair is missing from server
                console.log("🔐 No SEA credentials found. Attempting to derive from password...");
                try {
                    // Try to login with password
                    gunProfile = await GunAuth.login(username, password);
                } catch (loginErr) {
                    // If login fails, user might not exist in GunDB yet
                    console.log("🆕 Identity not found in GunDB. Registering...");
                    try {
                        await GunAuth.register(username, password);
                        gunProfile = GunAuth.getProfile();
                    } catch (regErr) {
                        console.error("GunDB registration failed:", regErr);
                    }
                }

                // If we now have a profile (and thus a pair), sync it back to the server
                if (gunProfile && (gunProfile as any).user?._?.sea) {
                    try {
                        const pair = (gunProfile as any).user._.sea;
                        await API.syncGunPair(pair);
                        console.log("✅ GunDB identity synced to server.");
                    } catch (syncErr) {
                        console.error("Failed to sync GunDB pair to server:", syncErr);
                    }
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
                } catch (subErr) {
                    console.error("Failed to subscribe to GunDB profile:", subErr);
                }
            }

            const transformedUser = result.user || { 
                username, 
                isAdmin: result.role === 'admin', 
                id: String(result.artistId || '0'),
                artistId: String(result.artistId)
            } as User;

            set({
                isAuthenticated: true,
                isAdminAuthenticated: true, // compat
                user: { ...transformedUser, gunProfile },
                adminUser: transformedUser, // compat
                mustChangePassword: !!result.mustChangePassword,
                role: (result as any).role || 'admin',
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
        set({ isLoading: true, isAdminLoading: true, isInitializing: true });
        try {
            const gunProfile = await GunAuth.loginWithPair(pair);
            set((state) => ({ 
                user: state.user ? { ...state.user, gunProfile } : { gunProfile } as any,
                isAuthenticated: true,
                isAdminAuthenticated: true,
                isLoading: false,
                isAdminLoading: false,
                isInitializing: false
            }));
        } catch (e) {
            set({ isLoading: false, isAdminLoading: false, isInitializing: false });
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
            // 1. Register on backend (creates DB user + artist + AP actor)
            const result = await API.registerUser(username, password);
            
            // 2. Auto-login with the JWT token
            API.setToken(result.token);

            // 3. Since we're logged in, perform a check to get the pair and full user object
            await get().checkAuth();

            set({ isLoading: false });
        } catch (e: any) {
            set({ error: e.message, isLoading: false });
            throw e;
        }
    },

    logout: () => {
        GunAuth.logout();
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
