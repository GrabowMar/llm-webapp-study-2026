import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, onUnauthorized, session } from "./api";

interface AuthState {
  username: string | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(() => (session.token ? session.username : null));

  useEffect(() => {
    onUnauthorized(() => {
      session.clear();
      setUsername(null);
    });
    return () => onUnauthorized(null);
  }, []);

  const login = useCallback(async (name: string, password: string) => {
    const res = await api.login(name, password);
    const display = res.username ?? name.trim();
    session.save(res.token, display);
    setUsername(display);
  }, []);

  const register = useCallback(
    async (name: string, password: string) => {
      await api.register(name, password);
      await login(name, password);
    },
    [login],
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      void 0;
    }
    session.clear();
    setUsername(null);
  }, []);

  const value = useMemo(() => ({ username, login, register, logout }), [username, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
