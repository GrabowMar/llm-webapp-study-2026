import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { api, clearSession, getStoredUsername, getToken, storeSession, storeUsername } from "./api";

interface AuthContextValue {
  username: string | null;
  ready: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(getStoredUsername());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const token = getToken();
    if (!token) {
      setUsername(null);
      setReady(true);
      return;
    }
    api
      .me()
      .then((user) => {
        if (cancelled) return;
        storeUsername(user.username);
        setUsername(user.username);
      })
      .catch(() => {
        if (cancelled) return;
        clearSession();
        setUsername(null);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (name: string, password: string) => {
    const session = await api.login(name, password);
    storeSession(session.token, name);
    setUsername(name);
  }, []);

  const signUp = useCallback(async (name: string, password: string) => {
    const session = await api.register(name, password);
    storeSession(session.token, session.username ?? name);
    setUsername(session.username ?? name);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // The session is dropped locally even if the call fails.
    }
    clearSession();
    setUsername(null);
  }, []);

  const value = useMemo(
    () => ({ username, ready, signIn, signUp, signOut }),
    [username, ready, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
