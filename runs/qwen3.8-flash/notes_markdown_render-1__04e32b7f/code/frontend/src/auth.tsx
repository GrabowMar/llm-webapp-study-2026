import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, getToken, setToken, setUnauthorizedHandler } from "./api";

interface AuthState {
  username: string | null;
  ready: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUnauthorizedHandler(() => setUsername(null));
    if (!getToken()) {
      setReady(true);
      return;
    }
    api
      .me()
      .then((me) => setUsername(me.username))
      .catch(() => setUsername(null))
      .finally(() => setReady(true));
  }, []);

  const signIn = useCallback(async (user: string, pass: string) => {
    const { token } = await api.login(user, pass);
    setToken(token);
    setUsername(user);
  }, []);

  const signUp = useCallback(async (user: string, pass: string) => {
    const { token } = await api.register(user, pass);
    setToken(token);
    setUsername(user);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    setToken(null);
    setUsername(null);
  }, []);

  const value = useMemo(
    () => ({ username, ready, signIn, signUp, signOut }),
    [username, ready, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
