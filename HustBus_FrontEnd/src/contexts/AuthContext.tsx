import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    ReactNode,
} from 'react';
import {
    login as loginRequest,
    register as registerRequest,
    getCurrentUser,
    setAuthToken,
} from '../services/api';

const STORAGE_KEY = 'transit-auth';
const REFRESH_TOKEN_KEY = 'transit-auth-refresh';

export interface User {
    id: string;
    name?: string;
    email: string;
    role?: string;
    isAdmin?: boolean;
    path_url?: string; // Avatar URL
}

interface AuthState {
    user: User | null;
    token: string | null;
}

interface AuthContextType extends AuthState {
    login: (credentials: any) => Promise<any>;
    register: (payload: any) => Promise<any>;
    logout: () => void;
    refreshUser: () => Promise<void>;
    refresh: () => Promise<void>;
    isAuthenticated: boolean;
    isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    token: null,
    login: async () => { },
    register: async () => { },
    logout: () => { },
    refreshUser: async () => { },
    refresh: async () => { },
    isAuthenticated: false,
    isAdmin: false,
});

function getInitialAuth(): AuthState {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return { user: null, token: null };
        const parsed = JSON.parse(stored) as AuthState;
        // IMPORTANT: Set Authorization header synchronously on app boot.
        // Otherwise, components may fire authenticated requests before AuthProvider's useEffect runs,
        // causing 401 -> refresh fail -> tokens cleared -> user appears "logged out" after reload.
        if (parsed?.token) {
            setAuthToken(parsed.token);
        }
        return parsed;
    } catch (error) {
        return { user: null, token: null };
    }
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [authState, setAuthState] = useState<AuthState>(getInitialAuth);

    const refreshUser = useCallback(async () => {
        try {
            const response = await getCurrentUser() as any;
            const userData = response?.user || response;
            if (userData) {
                // Ensure role is set properly from isAdmin flag
                const user = {
                    ...userData,
                    role: userData.role || (userData.isAdmin ? 'admin' : 'user')
                };
                setAuthState(prev => ({
                    ...prev,
                    user: user,
                }));
            }
        } catch (error) {
            console.error('Failed to refresh user:', error);
            // Optionally, log out if refresh fails due to invalid token
            // logout(); // This might cause a loop if logout also calls refresh
        }
    }, []);

    const logout = useCallback(async () => {
        try {
            // Call logout API to invalidate refresh token
            const { logoutApi } = await import('../services/api');
            await logoutApi();
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            // Clear all tokens
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(REFRESH_TOKEN_KEY);
            setAuthState({ user: null, token: null });
        }
    }, []);

    useEffect(() => {
        if (authState.token) {
            setAuthToken(authState.token);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(authState));
        } else {
            setAuthToken(null);
            localStorage.removeItem(STORAGE_KEY);
        }
    }, [authState]);

    const login = useCallback(async (credentials: any) => {
        const { email } = credentials;

        // Validate email format (all users must have @)
        if (!email.includes('@')) {
            throw new Error('Email phải chứa ký tự @');
        }

        // All logins go through backend
        const response = await loginRequest(credentials) as any;

        // Add role from backend response or default to 'user'
        const user = {
            ...response.user,
            role: response.user.role || (response.user.isAdmin ? 'admin' : 'user')
        };

        // Store refresh token separately
        if (response.refreshToken) {
            localStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
        }

        setAuthState({
            user,
            token: response.token,
        });
        return { user, token: response.token };
    }, []);

    const register = useCallback(async (payload: any) => {
        // Validate email for regular users
        if (!payload.email.includes('@')) {
            throw new Error('Email phải chứa ký tự @');
        }

        const response = await registerRequest(payload) as any;

        // Store refresh token separately
        if (response.refreshToken) {
            localStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
        }

        setAuthState({
            user: response.user,
            token: response.token,
        });
        return response;
    }, []);

    const refresh = useCallback(async () => {
        if (!authState.token) return;
        try {
            const response = await getCurrentUser() as any;
            const userData = response?.user || response;
            if (userData) {
                // Ensure role is set properly from isAdmin flag
                const user = {
                    ...userData,
                    role: userData.role || (userData.isAdmin ? 'admin' : 'user')
                };
                setAuthState((prev) => ({ ...prev, user }));
            }
        } catch (error) {
            logout();
        }
    }, [authState.token, logout]);

    useEffect(() => {
        if (authState.token && !authState.user) {
            refresh();
        }
    }, [authState.token, authState.user, refresh]);

    const value = useMemo(
        () => ({
            user: authState.user,
            token: authState.token,
            login,
            register,
            logout,
            refreshUser,
            refresh,
            isAuthenticated: Boolean(authState.token),
            isAdmin: authState.user?.role === 'admin',
        }),
        [authState, login, register, logout, refresh, refreshUser]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
