import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, clearSession, loadSession, onUnauthorized, saveSession } from "./api";

type AuthState = {
  username: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(() => loadSession()?.username ?? null);

  useEffect(() => {
    onUnauthorized(() => {
      clearSession();
      setUsername(null);
    });
    if (loadSession()) {
      api
        .me()
        .then((u) => setUsername(u.username))
        .catch(() => {});
    }
    return () => onUnauthorized(null);
  }, []);

  const login = useCallback(async (name: string, password: string) => {
    const res = await api.login(name, password);
    saveSession(res.token, res.username ?? name);
    setUsername(res.username ?? name);
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    clearSession();
    setUsername(null);
  }, []);

  const value = useMemo(() => ({ username, login, logout }), [username, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
