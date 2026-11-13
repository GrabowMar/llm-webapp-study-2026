import { createContext } from "react";
import { useContext } from "react";
import { useEffect } from "react";
import { useMemo } from "react";
import { useState } from "react";
import type { ReactNode } from "react";
import { api } from "./api";
import { clearSession } from "./api";
import { getStoredUsername } from "./api";
import { getToken } from "./api";
import { storeSession } from "./api";

interface AuthContextValue {
  token: string | null;
  username: string | null;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (username: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getToken());
  const [username, setUsername] = useState<string | null>(() => getStoredUsername());

  useEffect(() => {
    const sync = () => {
      setToken(getToken());
      setUsername(getStoredUsername());
    };
    window.addEventListener("auth-changed", sync);
    return () => window.removeEventListener("auth-changed", sync);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      username,
      async signIn(user: string, password: string) {
        const data = await api<{ token: string }>("/api/auth/login", {
          method: "POST",
          body: { username: user, password },
        });
        storeSession(data.token, user);
      },
      async signUp(user: string, password: string) {
        await api("/api/auth/register", { method: "POST", body: { username: user, password } });
        const data = await api<{ token: string }>("/api/auth/login", {
          method: "POST",
          body: { username: user, password },
        });
        storeSession(data.token, user);
      },
      signOut() {
        clearSession();
      },
    }),
    [token, username],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
