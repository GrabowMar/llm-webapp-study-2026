import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api } from "./api";
import type { Auth } from "./api";

interface AuthContextValue {
  auth: Auth | null;
  isAdmin: boolean;
  ready: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (username: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<Auth | null>(() => {
    try {
      const raw = localStorage.getItem("quiz_auth");
      return raw ? (JSON.parse(raw) as Auth) : null;
    } catch {
      return null;
    }
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!auth) {
      setReady(true);
      return;
    }
    let cancelled = false;
    api
      .me(auth.token)
      .then((me) => {
        if (!cancelled) setAuth({ username: me.username, token: auth.token, role: me.role });
      })
      .catch(() => {
        if (!cancelled) setAuth(null);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (auth) localStorage.setItem("quiz_auth", JSON.stringify(auth));
    else localStorage.removeItem("quiz_auth");
  }, [auth]);

  const signIn = async (username: string, password: string) => {
    const { token } = await api.login(username, password);
    const me = await api.me(token);
    setAuth({ username: me.username, token, role: me.role });
  };

  const signUp = async (username: string, password: string) => {
    const { token } = await api.register(username, password);
    setAuth({ username, token, role: "user" });
  };

  const value: AuthContextValue = {
    auth,
    isAdmin: auth?.role === "admin",
    ready,
    signIn,
    signUp,
    signOut: () => setAuth(null),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
