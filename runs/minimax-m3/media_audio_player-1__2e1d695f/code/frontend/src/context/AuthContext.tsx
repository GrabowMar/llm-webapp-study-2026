import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { api, getToken, storeToken } from "../api";
import type { User } from "../types";

type AuthContextValue = {
  user: User | null;
  initialising: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initialising, setInitialising] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const token = getToken();
    if (!token) {
      setInitialising(false);
      return;
    }
    api
      .me()
      .then((data) => {
        if (!cancelled) setUser({ id: data.id, username: data.username });
      })
      .catch(() => {
        storeToken(null);
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setInitialising(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const result = await api.login(username, password);
    storeToken(result.token);
    setUser({ id: result.id, username: result.username });
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    const result = await api.register(username, password);
    storeToken(result.token);
    setUser({ id: result.id, username: result.username });
  }, []);

  const logout = useCallback(() => {
    api.logout().catch(() => undefined);
    storeToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, initialising, login, register, logout }),
    [user, initialising, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside an AuthProvider");
  return context;
}
