import { useCallback, useEffect, useState } from "react";
import { AuthScreen } from "./components/AuthScreen";
import { TodoBoard } from "./components/TodoBoard";
import { api, ApiError } from "./lib/api";
import { clearToken, loadToken, saveToken } from "./lib/session";

export default function App() {
  const [token, setToken] = useState<string | null>(() => loadToken());
  const [username, setUsername] = useState<string>("");
  const [checking, setChecking] = useState<boolean>(() => Boolean(loadToken()));

  const signOut = useCallback(() => {
    clearToken();
    setToken(null);
    setUsername("");
    setChecking(false);
  }, []);

  useEffect(() => {
    const stored = loadToken();
    if (!stored) {
      setChecking(false);
      return;
    }
    let active = true;
    api
      .me(stored)
      .then((user) => {
        if (active) {
          setToken(stored);
          setUsername(user.username);
        }
      })
      .catch((err: unknown) => {
        if (!active) {
          return;
        }
        if (err instanceof ApiError && err.status === 401) {
          clearToken();
          setToken(null);
        }
      })
      .finally(() => {
        if (active) {
          setChecking(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSignedIn = (newToken: string, name: string) => {
    saveToken(newToken);
    setToken(newToken);
    setUsername(name);
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  if (!token) {
    return <AuthScreen onSignedIn={handleSignedIn} />;
  }

  return <TodoBoard token={token} username={username} onSignOut={signOut} />;
}
