import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, getToken, setToken } from "./api";

interface AuthState {
  username: string | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const USER_KEY = "sensor-dashboard-user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(() =>
    getToken() ? localStorage.getItem(USER_KEY) : null,
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      setReady(true);
      return;
    }
    api
      .me()
      .then((u) => {
        setUsername(u.username);
        localStorage.setItem(USER_KEY, u.username);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          setToken(null);
          localStorage.removeItem(USER_KEY);
          setUsername(null);
        }
      })
      .finally(() => setReady(true));
  }, []);

  const login = useCallback(async (u: string, p: string) => {
    const res = await api.login(u, p);
    setToken(res.token);
    const name = res.username ?? u.trim();
    localStorage.setItem(USER_KEY, name);
    setUsername(name);
  }, []);

  const register = useCallback(
    async (u: string, p: string) => {
      await api.register(u, p);
      await login(u, p);
    },
    [login],
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* token may already be invalid */
    }
    setToken(null);
    localStorage.removeItem(USER_KEY);
    setUsername(null);
  }, []);

  return (
    <AuthContext.Provider value={{ username, ready, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
