import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getToken, me, setToken } from "./api";

interface AuthContextValue {
  username: string | null;
  ready: boolean;
  signIn: (token: string, username: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const token = getToken();
    if (!token) {
      setReady(true);
      return;
    }
    me()
      .then((user) => {
        if (!cancelled) setUsername(user.username);
      })
      .catch(() => {
        if (!cancelled) setToken(null);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback((token: string, name: string) => {
    setToken(token);
    setUsername(name);
    me()
      .then((user) => setUsername(user.username))
      .catch(() => {
        /* keep the provided name */
      });
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setUsername(null);
  }, []);

  const value = useMemo(
    () => ({ username, ready, signIn, signOut }),
    [username, ready, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
