import { useCallback, useEffect, useState } from "react";
import { ApiError, getStoredToken, me, setStoredToken } from "./api";
import AuthScreen from "./components/AuthScreen";
import TodoApp from "./components/TodoApp";

export default function App() {
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [username, setUsername] = useState("");
  const [checking, setChecking] = useState(Boolean(getStoredToken()));

  useEffect(() => {
    if (!token) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    me()
      .then((user) => {
        if (!cancelled) {
          setUsername(user.username);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          setStoredToken(null);
          setToken(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setChecking(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleAuthenticated = useCallback((newToken: string, name: string) => {
    setStoredToken(newToken);
    setToken(newToken);
    setUsername(name);
  }, []);

  const handleSignOut = useCallback(() => {
    setStoredToken(null);
    setToken(null);
    setUsername("");
  }, []);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  if (!token) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  return <TodoApp username={username} onSignOut={handleSignOut} />;
}
