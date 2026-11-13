import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as api from "./api";

type AuthContextValue = {
  username: string | null;
  ready: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = api.getToken();
    if (!token) {
      setReady(true);
      return;
    }
    api
      .me(token)
      .then((user) => setUsername(user.username))
      .catch(() => {
        api.setToken(null);
        setUsername(null);
      })
      .finally(() => setReady(true));
  }, []);

  const signIn = useCallback(async (name: string, password: string) => {
    const result = await api.login(name, password);
    api.setToken(result.token);
    setUsername(result.user?.username ?? name);
  }, []);

  const signUp = useCallback(async (name: string, password: string) => {
    const result = await api.register(name, password);
    api.setToken(result.token);
    setUsername(result.username ?? name);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* the token may already be gone */
    }
    api.setToken(null);
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
