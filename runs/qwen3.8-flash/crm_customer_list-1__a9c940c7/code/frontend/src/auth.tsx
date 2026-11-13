import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, getToken, setOnUnauthorized, setToken } from "./api";
import { navigate } from "./router";

interface AuthContextValue {
  username: string | null;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const USER_KEY = "cd_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(() =>
    getToken() ? localStorage.getItem(USER_KEY) : null,
  );

  const clearSession = useCallback(() => {
    setToken(null);
    localStorage.removeItem(USER_KEY);
    setUsername(null);
  }, []);

  useEffect(() => {
    setOnUnauthorized(() => {
      clearSession();
      navigate("/login");
    });
  }, [clearSession]);

  const signIn = useCallback(async (user: string, password: string) => {
    const { token } = await api.login(user, password);
    setToken(token);
    localStorage.setItem(USER_KEY, user);
    setUsername(user);
  }, []);

  const value = useMemo(
    () => ({ username, signIn, signOut: clearSession }),
    [username, signIn, clearSession],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
