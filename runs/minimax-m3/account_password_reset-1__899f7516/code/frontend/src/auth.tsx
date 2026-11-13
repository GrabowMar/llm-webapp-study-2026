import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { getMe, getToken, login as apiLogin, logout as apiLogout, setToken } from "./api";
import type { Account } from "./api";

type AuthContextValue = {
  account: Account | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setAccount(null);
      setLoading(false);
      return;
    }
    try {
      setAccount(await getMe());
    } catch {
      setToken(null);
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback(async (username: string, password: string) => {
    await apiLogin(username, password);
    setAccount(await getMe());
  }, []);

  const signOut = useCallback(async () => {
    await apiLogout();
    setAccount(null);
  }, []);

  const value = useMemo(
    () => ({ account, loading, signIn, signOut, refresh }),
    [account, loading, signIn, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }
  return context;
}
