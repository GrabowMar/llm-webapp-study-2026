import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api, getToken, setToken } from "./api";

interface AuthValue {
  username: string | null;
  checking: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (username: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(null);
  const [ready, setReady] = useState(getToken() === null);

  useEffect(() => {
    if (!getToken()) return;
    api
      .me()
      .then((me) => setUsername(me.username))
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, []);

  const signIn = useCallback(async (name: string, password: string) => {
    const { token } = await api.login(name, password);
    setToken(token);
    setUsername(name);
  }, []);

  const signUp = useCallback(
    async (name: string, password: string) => {
      await api.register(name, password);
      await signIn(name, password);
    },
    [signIn],
  );

  const signOut = useCallback(() => {
    setToken(null);
    setUsername(null);
  }, []);

  return (
    <AuthContext.Provider value={{ username, checking: !ready, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
