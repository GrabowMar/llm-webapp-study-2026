import { useCallback, useState } from "react";
import AuthPanel from "./components/AuthPanel";
import Converter from "./components/Converter";
import History from "./components/History";

interface Session {
  username: string;
  token: string;
}

const TOKEN_KEY = "b64.token";
const USER_KEY = "b64.username";

function loadSession(): Session | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const username = localStorage.getItem(USER_KEY);
    if (token && username) return { username, token };
  } catch {
    /* ignore */
  }
  return null;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [reloadToken, setReloadToken] = useState(0);

  const onSignedIn = useCallback((username: string, token: string) => {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, username);
    } catch {
      /* ignore */
    }
    setSession({ username, token });
    setReloadToken((v) => v + 1);
  }, []);

  const signOut = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      /* ignore */
    }
    setSession(null);
  }, []);

  const onSaved = useCallback(() => {
    setReloadToken((v) => v + 1);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <h1 className="text-xl font-bold">Base64 Converter</h1>
          {session ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">
                Signed in as{" "}
                <span className="font-medium text-gray-900">
                  {session.username}
                </span>
              </span>
              <button
                type="button"
                onClick={signOut}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Sign out
              </button>
            </div>
          ) : (
            <span className="text-sm text-gray-500">Not signed in</span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        {!session && <AuthPanel onSignedIn={onSignedIn} />}
        <Converter
          signedIn={Boolean(session)}
          token={session?.token ?? null}
          onSaved={onSaved}
        />
        {session && <History token={session.token} reloadToken={reloadToken} />}
      </main>
    </div>
  );
}
