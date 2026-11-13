import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, session } from "./api";

type AuthState = {
  username: string | null;
  signIn: (token: string, username: string) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthState>({ username: null, signIn: () => {}, signOut: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(session.username);

  useEffect(() => {
    if (!session.token) return;
    api.me().catch((e) => {
      if (e.status === 401) {
        session.clear();
        setUsername(null);
      }
    });
  }, []);

  const signIn = (token: string, name: string) => {
    session.set(token, name);
    setUsername(name);
  };
  const signOut = () => {
    session.clear();
    setUsername(null);
  };
  return <AuthContext.Provider value={{ username, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
