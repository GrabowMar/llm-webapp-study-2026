import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, session, setUnauthorizedHandler } from "./api";

type AuthState = {
  username: string | null;
  login: (u: string, p: string) => Promise<void>;
  register: (u: string, p: string) => Promise<void>;
  logout: () => void;
};

const Ctx = createContext<AuthState>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(
    session.token ? session.username : null,
  );

  const logout = useCallback(() => {
    session.clear();
    setUsername(null);
  }, []);

  useEffect(() => setUnauthorizedHandler(logout), [logout]);

  const login = useCallback(async (u: string, p: string) => {
    const res = await api.login(u, p);
    session.set(res.token, res.username ?? u);
    setUsername(res.username ?? u);
  }, []);

  const register = useCallback(
    async (u: string, p: string) => {
      await api.register(u, p);
      await login(u, p);
    },
    [login],
  );

  return <Ctx.Provider value={{ username, login, register, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
