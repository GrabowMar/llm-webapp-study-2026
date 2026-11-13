import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ApiError, fetchLocks, fetchMe, login as loginRequest } from "./api";
import type { Me } from "./api";

const TOKEN_KEY = "signin.token";

type AuthValue = {
  token: string | null;
  user: Me | null;
  isAdmin: boolean;
  ready: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => void;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

function readStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function storeToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage is unavailable - the session simply is not persisted */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => readStoredToken());
  const [user, setUser] = useState<Me | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [ready, setReady] = useState(false);

  const loadUser = useCallback(async (activeToken: string | null) => {
    if (!activeToken) {
      setUser(null);
      setIsAdmin(false);
      setReady(true);
      return;
    }
    try {
      const me = await fetchMe(activeToken);
      setUser(me);
      try {
        await fetchLocks(activeToken);
        setIsAdmin(true);
      } catch {
        setIsAdmin(false);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        storeToken(null);
        setToken(null);
      }
      setUser(null);
      setIsAdmin(false);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void loadUser(token);
  }, [token, loadUser]);

  const signIn = useCallback(async (username: string, password: string) => {
    const { token: freshToken } = await loginRequest(username, password);
    storeToken(freshToken);
    setToken(freshToken);
    await loadUser(freshToken);
  }, [loadUser]);

  const signOut = useCallback(() => {
    storeToken(null);
    setToken(null);
    setUser(null);
    setIsAdmin(false);
  }, []);

  const refresh = useCallback(async () => {
    await loadUser(token);
  }, [loadUser, token]);

  const value = useMemo(
    () => ({ token, user, isAdmin, ready, signIn, signOut, refresh }),
    [token, user, isAdmin, ready, signIn, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
