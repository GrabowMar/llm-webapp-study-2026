import { useCallback, useEffect, useState } from "react";
import { ApiError, fetchMe } from "../api";
import type { AuthenticatedUser } from "../types";

const TOKEN_KEY = "gallery.token";

interface AuthState {
  token: string | null;
  user: AuthenticatedUser | null;
  restoring: boolean;
  signIn: (token: string, user: AuthenticatedUser) => void;
  signOut: () => void;
}

export function useAuth(): AuthState {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  });
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [restoring, setRestoring] = useState(false);

  const signOut = useCallback(() => {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore storage failures
    }
    setToken(null);
    setUser(null);
  }, []);

  const signIn = useCallback((nextToken: string, nextUser: AuthenticatedUser) => {
    try {
      window.localStorage.setItem(TOKEN_KEY, nextToken);
    } catch {
      // ignore storage failures
    }
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setRestoring(false);
      return;
    }
    let cancelled = false;
    setRestoring(true);
    fetchMe(token)
      .then((me) => {
        if (!cancelled) {
          setUser(me);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled && caught instanceof ApiError && caught.status === 401) {
          signOut();
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRestoring(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, signOut]);

  return { token, user, restoring, signIn, signOut };
}
