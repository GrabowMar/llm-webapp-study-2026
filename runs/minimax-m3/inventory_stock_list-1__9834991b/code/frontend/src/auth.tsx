import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ApiError, api, getToken, setToken } from "./api";

interface AuthValue {
  username: string | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const token = getToken();
    if (!token) {
      setReady(true);
      return () => {
        cancelled = true;
      };
    }
    api
      .me()
      .then((user) => {
        if (!cancelled) {
          setUsername(user.username);
        }
      })
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) {
          setToken(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (name: string, password: string) => {
    const result = await api.login(name, password);
    setToken(result.token);
    setUsername(result.username);
  }, []);

  const register = useCallback(async (name: string, password: string) => {
    const result = await api.register(name, password);
    setToken(result.token);
    setUsername(result.username);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      setToken(null);
    }
    setToken(null);
    setUsername(null);
  }, []);

  const value = useMemo(
    () => ({ username, ready, login, register, logout }),
    [username, ready, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }
  return value;
}
