import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api, session } from "./api";

type AuthState = {
  username: string | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(
    session.token ? session.username : null,
  );

  useEffect(() => {
    const onExpired = () => setUsername(null);
    window.addEventListener("session-expired", onExpired);
    return () => window.removeEventListener("session-expired", onExpired);
  }, []);

  const login = useCallback(async (user: string, password: string) => {
    const res = await api<{ token: string; username?: string }>("/auth/login", {
      method: "POST",
      body: { username: user, password },
    });
    const name = res.username ?? user;
    session.set(res.token, name);
    setUsername(name);
  }, []);

  const register = useCallback(
    async (user: string, password: string) => {
      await api("/auth/register", {
        method: "POST",
        body: { username: user, password },
      });
      await login(user, password);
    },
    [login],
  );

  const logout = useCallback(() => {
    session.clear();
    setUsername(null);
  }, []);

  return (
    <Ctx.Provider value={{ username, login, register, logout }}>{children}</Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("AuthProvider missing");
  return ctx;
}
