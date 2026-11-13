import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, getToken, setToken, setUnauthorizedHandler } from "./api";

type AuthState = {
  username: string | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);
const USER_KEY = "notes.username";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(() =>
    getToken() ? localStorage.getItem(USER_KEY) : null,
  );
  const [ready, setReady] = useState(!getToken());

  const clear = useCallback(() => {
    setToken(null);
    localStorage.removeItem(USER_KEY);
    setUsername(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(clear);
    return () => setUnauthorizedHandler(null);
  }, [clear]);

  useEffect(() => {
    if (!getToken()) return;
    api
      .me()
      .then((u) => {
        localStorage.setItem(USER_KEY, u.username);
        setUsername(u.username);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const login = useCallback(async (name: string, password: string) => {
    const res = await api.login(name, password);
    setToken(res.token);
    const finalName = res.username ?? name.trim();
    localStorage.setItem(USER_KEY, finalName);
    setUsername(finalName);
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
      if (getToken()) await api.logout();
    } catch {
      void 0;
    }
    clear();
  }, [clear]);

  const value = useMemo(
    () => ({ username, ready, login, register, logout }),
    [username, ready, login, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
