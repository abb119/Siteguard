import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { authLogin, authLogout, authMe, getToken, type Me } from "../lib/api";

type AuthState = {
    user: Me | null;
    loading: boolean;
    login: (username: string, password: string) => Promise<Me>;
    logout: () => void;
};

const AuthContext = createContext<AuthState>({
    user: null,
    loading: true,
    login: async () => { throw new Error("AuthProvider missing"); },
    logout: () => { },
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<Me | null>(null);
    const [loading, setLoading] = useState(true);

    // Restore session from a stored token on first mount
    useEffect(() => {
        if (!getToken()) {
            setLoading(false);
            return;
        }
        authMe()
            .then(setUser)
            .catch(() => authLogout())
            .finally(() => setLoading(false));
    }, []);

    const login = useCallback(async (username: string, password: string) => {
        await authLogin(username, password);
        const me = await authMe();
        setUser(me);
        return me;
    }, []);

    const logout = useCallback(() => {
        authLogout();
        setUser(null);
    }, []);

    return (
        <AuthContext.Provider value={{ user, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

/** Route guard: requires a logged-in user, optionally with one of `roles`. */
export const RequireAuth: React.FC<{ roles?: Array<Me["role"]>; children: React.ReactNode }> = ({ roles, children }) => {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="min-h-screen bg-grid flex items-center justify-center">
                <span className="hud-label animate-pulse">Comprobando sesión…</span>
            </div>
        );
    }
    if (!user) {
        return <Navigate to="/login" state={{ from: location.pathname }} replace />;
    }
    if (roles && !roles.includes(user.role)) {
        return (
            <div className="min-h-screen bg-grid flex flex-col items-center justify-center gap-3">
                <span className="font-mono uppercase tracking-widest text-alarm-400">Acceso denegado</span>
                <span className="hud-label">Tu rol ({user.role}) no tiene permisos para esta sección</span>
            </div>
        );
    }
    return <>{children}</>;
};
