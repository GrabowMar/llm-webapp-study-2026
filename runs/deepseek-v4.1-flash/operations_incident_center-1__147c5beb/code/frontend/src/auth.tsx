import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { clearSession, getStoredUser, getToken, storeSession } from "./api";

interface AuthValue {
  username: string | null;
  signIn: (token: string, username: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [username, setUsername] = useState<string | null>(() =>
    getToken() ? getStoredUser() : null,
  );

  const signIn = useCallback((token: string, name: string) => {
    storeSession(token, name);
    setUsername(name);
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setUsername(null);
    window.history.pushState(null, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);

  const value = useMemo(
    () => ({ username, signIn, signOut }),
    [username, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
