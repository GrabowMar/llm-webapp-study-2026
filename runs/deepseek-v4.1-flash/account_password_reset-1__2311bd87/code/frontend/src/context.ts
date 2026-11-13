import { createContext, useContext } from "react";
import type { Account } from "./api";

export type Router = {
  path: string;
  navigate: (to: string) => void;
};

export const RouterContext = createContext<Router>({
  path: "/",
  navigate: () => {},
});

export function useRouter() {
  return useContext(RouterContext);
}

export type Auth = {
  account: Account | null;
  loading: boolean;
  signIn: (token: string, account: Account) => void;
  signOut: () => void;
  refresh: () => Promise<void>;
};

export const AuthContext = createContext<Auth>({
  account: null,
  loading: true,
  signIn: () => {},
  signOut: () => {},
  refresh: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}
