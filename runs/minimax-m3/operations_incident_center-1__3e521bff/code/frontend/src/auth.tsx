import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, clearSession, getStoredUsername, getToken, setSession } from "./api";

interface AuthState {
  username: string | null;
  token: string | null;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (username: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [username, setUsername] = useState<string | null>(() => getStoredUsername());

  const signIn = useCallback(async (name: string, password: string) => {
    const result = await api.login(name, password);
    setSession(result.token, result.username ?? name);
    setTokenState(result.token);
    setUsername(result.username ?? name);
  }, []);

  const signUp = useCallback(async (name: string, password: string) => {
    await api.register(name, password);
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setTokenState(null);
    setUsername(null);
  }, []);

  const value = useMemo(
    () => ({ username, token, signIn, signUp, signOut }),
    [username, token, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
