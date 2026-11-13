import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { clearSession, getStoredUsername, getToken, storeSession } from "./api";

type AuthValue = {
  token: string | null;
  username: string | null;
  signedIn: boolean;
  signIn: (token: string, username: string) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getToken());
  const [username, setUsername] = useState<string | null>(() => getStoredUsername());

  const signIn = useCallback((newToken: string, newUsername: string) => {
    storeSession(newToken, newUsername);
    setToken(newToken);
    setUsername(newUsername);
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setToken(null);
    setUsername(null);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ token, username, signedIn: token !== null, signIn, signOut }),
    [token, username, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
