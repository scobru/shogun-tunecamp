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
    loginAdmin: (username: string, password?: string) => Promise<void>;
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

    clearError: () => set({ error: null }),

    init: async () => {
        set({ isLoading: true });
        await get().checkAuth();
    },

    checkAuth: async () => {
        set({ isLoading: true });
        try {
            const status = await API.getAuthStatus();
            const isAdmin = status.authenticated && (status.role === 'admin' || status.role === 'user');
            
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
                role: (status as any).role || (status.authenticated ? 'admin' : null),
                isLoading: false
            });
        } catch (e) {
            set({ isAuthenticated: false, isAdminAuthenticated: false, user: null, adminUser: null, isLoading: false, isFirstRun: false, role: null });
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
                    
                    // Subscribe to profile changes
                    GunAuth.subscribeProfile((profileData) => {
                        set((state) => ({
                            user: state.user ? { ...state.user, gunProfile: { ...state.user.gunProfile!, profile: profileData } } : null
                        }));
                    });
                } catch (gunErr) {
                    console.error("Failed to auto-login to GunDB:", gunErr);
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
                isLoading: false
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
            role: null 
        });
    }
}));
