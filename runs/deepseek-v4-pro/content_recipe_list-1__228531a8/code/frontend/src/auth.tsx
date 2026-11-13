import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { clearSession, getStoredUser, getToken, setSession } from "./api";

interface AuthContextValue {
  username: string | null;
  isAuthed: boolean;
  signIn: (token: string, username: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(() => {
    return getToken() ? getStoredUser() : null;
  });

  const signIn = useCallback((token: string, username: string) => {
    setSession(token, username);
    setUsername(username);
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setUsername(null);
  }, []);

  useEffect(() => {
    if (!getToken()) setUsername(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ username, isAuthed: username !== null, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
