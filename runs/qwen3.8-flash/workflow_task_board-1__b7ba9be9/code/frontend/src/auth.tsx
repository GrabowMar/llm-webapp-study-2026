import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

import { api, ApiError, getToken, setToken } from "./api";

interface AuthContextValue {
  username: string | null;
  busy: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setBusy(false);
      return;
    }
    api
      .me()
      .then((me) => setUsername(me.username))
      .catch(() => {
        setToken(null);
      })
      .finally(() => setBusy(false));
  }, []);

  const login = useCallback(async (name: string, password: string) => {
    const { token } = await api.login(name, password);
    setToken(token);
    const me = await api.me();
    setUsername(me.username);
  }, []);

  const register = useCallback(async (name: string, password: string) => {
    await api.register(name, password);
    await login(name, password);
  }, [login]);

  const logout = useCallback(() => {
    setToken(null);
    setUsername(null);
  }, []);

  return (
    <AuthContext.Provider value={{ username, busy, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}
