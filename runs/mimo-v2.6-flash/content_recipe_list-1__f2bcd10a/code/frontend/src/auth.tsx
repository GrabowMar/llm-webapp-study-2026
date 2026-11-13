import { createContext, useContext } from "react";

export type AuthContextValue = {
  token: string | null;
  username: string | null;
  signIn: (token: string, username: string) => void;
  signOut: () => void;
};

export const AuthContext = createContext<AuthContextValue>({
  token: null,
  username: null,
  signIn: () => {},
  signOut: () => {},
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
