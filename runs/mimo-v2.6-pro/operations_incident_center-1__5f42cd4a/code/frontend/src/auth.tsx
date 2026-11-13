import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { clearSession, getToken, getUsername, saveSession } from "./api";

interface AuthContextValue {
  username: string | null;
  signedIn: boolean;
  signIn: (token: string, username: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  username: null,
  signedIn: false,
  signIn: () => {},
  signOut: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(getUsername());

  const signIn = useCallback((token: string, name: string) => {
    saveSession(token, name);
    setUsername(name);
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setUsername(null);
  }, []);

  const value = useMemo(
    () => ({ username, signedIn: !!username && !!getToken(), signIn, signOut }),
    [username, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
