import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { apiLogin, apiLogout, apiMe, apiRegister, readToken, writeToken } from "./api";
import type { Account } from "./types";

type AuthContextValue = {
  user: Account | null;
  ready: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Account | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!readToken()) {
      setReady(true);
      return;
    }
    let cancelled = false;
    apiMe()
      .then((account) => {
        if (!cancelled) setUser(account);
      })
      .catch(() => {
        writeToken(null);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    const result = await apiLogin(username, password);
    writeToken(result.token);
    const account = await apiMe();
    setUser(account);
  }, []);

  const signUp = useCallback(async (username: string, password: string) => {
    await apiRegister(username, password);
    const result = await apiLogin(username, password);
    writeToken(result.token);
    const account = await apiMe();
    setUser(account);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      /* the local session is dropped either way */
    }
    writeToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, ready, signIn, signUp, signOut }),
    [user, ready, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside an AuthProvider");
  return context;
}
