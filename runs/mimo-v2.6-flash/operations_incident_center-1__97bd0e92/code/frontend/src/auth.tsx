import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, clearSession, getUsername, setSession } from "./api";

interface AuthContextValue {
  username: string | null;
  signIn: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(() => getUsername());

  const signIn = useCallback(async (name: string, password: string) => {
    const result = await api<{ token: string }>("/api/auth/login", {
      method: "POST",
      body: { username: name, password },
    });
    setSession(result.token, name.trim());
    setUsername(name.trim());
  }, []);

  const register = useCallback(
    async (name: string, password: string) => {
      await api("/api/auth/register", {
        method: "POST",
        body: { username: name, password },
      });
      await signIn(name, password);
    },
    [signIn],
  );

  const signOut = useCallback(() => {
    clearSession();
    setUsername(null);
  }, []);

  const value = useMemo(
    () => ({ username, signIn, register, signOut }),
    [username, signIn, register, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
