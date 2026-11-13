import { createContext, useContext, useEffect, useState } from "react";
import { AuthState, readAuth, writeAuth } from "./api";

interface AuthContextValue {
  auth: AuthState;
  signIn: (username: string, token: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  auth: { username: null, token: null },
  signIn: () => {},
  signOut: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(() => readAuth());

  useEffect(() => {
    writeAuth(auth);
  }, [auth]);

  const signIn = (username: string, token: string) => setAuth({ username, token });
  const signOut = () => setAuth({ username: null, token: null });

  return <AuthContext.Provider value={{ auth, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
