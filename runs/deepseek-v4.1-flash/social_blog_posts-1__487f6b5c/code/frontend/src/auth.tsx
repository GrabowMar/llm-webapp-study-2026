import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getToken, request, storeToken } from "./api";
import type { User } from "./types";

type AuthState = {
  user: User | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!getToken()) {
      setLoading(false);
      return;
    }
    request<User>("/api/auth/me")
      .then((me) => {
        if (active) setUser(me);
      })
      .catch(() => {
        storeToken(null);
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    const result = await request<{ token: string }>("/api/auth/login", {
      method: "POST",
      body: { username, password },
    });
    storeToken(result.token);
    const me = await request<User>("/api/auth/me");
    setUser(me);
  }, []);

  const register = useCallback(
    async (username: string, password: string) => {
      await request("/api/auth/register", {
        method: "POST",
        body: { username, password },
      });
      await signIn(username, password);
    },
    [signIn],
  );

  const signOut = useCallback(async () => {
    try {
      await request("/api/auth/logout", { method: "POST" });
    } catch {
      // The local session is cleared even if the server call fails.
    }
    storeToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, register, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
