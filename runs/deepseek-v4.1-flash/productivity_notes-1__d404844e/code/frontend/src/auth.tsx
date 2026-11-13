import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, clearSession, loadSession, saveSession } from "./api";

interface AuthState {
  token: string | null;
  username: string | null;
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    const session = loadSession();
    return session
      ? { token: session.token, username: session.username }
      : { token: null, username: null };
  });

  const applySession = useCallback((token: string, username: string) => {
    saveSession(token, username);
    setState({ token, username });
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      const data = await api<{ token: string; username?: string }>(
        "/api/auth/login",
        { method: "POST", body: { username, password } },
      );
      applySession(data.token, data.username ?? username);
    },
    [applySession],
  );

  const register = useCallback(
    async (username: string, password: string) => {
      const data = await api<{ token: string; username?: string }>(
        "/api/auth/register",
        { method: "POST", body: { username, password } },
      );
      applySession(data.token, data.username ?? username);
    },
    [applySession],
  );

  const logout = useCallback(() => {
    clearSession();
    setState({ token: null, username: null });
  }, []);

  const value = useMemo(
    () => ({ ...state, login, register, logout }),
    [state, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
