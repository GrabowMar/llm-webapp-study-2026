import { createContext, useContext } from "react";

export interface AuthState {
  username: string | null;
  token: string | null;
  signIn: (token: string, username: string) => void;
  signOut: () => void;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AuthContext missing");
  return ctx;
}
