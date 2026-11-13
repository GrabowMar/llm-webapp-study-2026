import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Navigate, Outlet } from "react-router-dom";
import { fetchMe, getToken, login, register, setToken } from "./api";

interface AuthContextValue {
  token: string | null;
  username: string | null;
  ready: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (username: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [username, setUsername] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setUsername(null);
      setReady(true);
      return;
    }
    setReady(false);
    fetchMe()
      .then((user) => {
        if (!cancelled) {
          setUsername(user.username);
          setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setToken(null);
          setTokenState(null);
          setUsername(null);
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    const onExpired = () => {
      setTokenState(null);
      setUsername(null);
    };
    window.addEventListener("auth-expired", onExpired);
    return () => window.removeEventListener("auth-expired", onExpired);
  }, []);

  const signIn = useCallback(async (name: string, password: string) => {
    const { token: newToken } = await login(name, password);
    setToken(newToken);
    setTokenState(newToken);
    setUsername(name);
  }, []);

  const signUp = useCallback(async (name: string, password: string) => {
    const result = await register(name, password);
    setToken(result.token);
    setTokenState(result.token);
    setUsername(result.username);
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setTokenState(null);
    setUsername(null);
  }, []);

  const value = useMemo(
    () => ({ token, username, ready, signIn, signUp, signOut }),
    [token, username, ready, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function RequireAuth() {
  const { token } = useAuth();
  if (!token) return <Navigate to="/" replace />;
  return <Outlet />;
}
