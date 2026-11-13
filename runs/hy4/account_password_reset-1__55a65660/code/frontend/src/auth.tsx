import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { api, getToken, setToken } from "./api";
import type { Account } from "./types";

type AuthState = {
  account: Account | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  register: (
    username: string,
    password: string,
    email: string,
  ) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  updateAccount: (account: Account) => void;
};

const AuthContext = createContext<AuthState | null>(null);

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
      setAccount(await api.me());
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
    const { token } = await api.login(username, password);
    setToken(token);
    setAccount(await api.me());
  }, []);

  const register = useCallback(
    async (username: string, password: string, email: string) => {
      await api.register(username, password, email);
      await signIn(username, password);
    },
    [signIn],
  );

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // local sign-out still applies
    }
    setToken(null);
    setAccount(null);
  }, []);

  const updateAccount = useCallback((next: Account) => setAccount(next), []);

  const value = useMemo(
    () => ({
      account,
      loading,
      signIn,
      register,
      signOut,
      refresh,
      updateAccount,
    }),
    [account, loading, signIn, register, signOut, refresh, updateAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
