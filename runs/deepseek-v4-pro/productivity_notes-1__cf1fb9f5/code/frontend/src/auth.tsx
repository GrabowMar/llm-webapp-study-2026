import { createContext, useContext, useState, type ReactNode } from "react";
import { setToken } from "./api";

interface AuthState {
  username: string | null;
  signIn: (username: string, token: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(
    () => localStorage.getItem("username"),
  );

  function signIn(name: string, tok: string) {
    setToken(tok);
    localStorage.setItem("username", name);
    setUsername(name);
  }

  function signOut() {
    setToken(null);
    localStorage.removeItem("username");
    setUsername(null);
  }

  return (
    <AuthContext.Provider value={{ username, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
