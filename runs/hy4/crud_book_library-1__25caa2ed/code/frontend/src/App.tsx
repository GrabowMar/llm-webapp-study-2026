import { useCallback, useEffect, useState } from "react";
import { api, clearSession, getToken, getUsername, saveSession } from "./api";
import AuthForm from "./AuthForm";
import BookDetail from "./BookDetail";
import BookForm from "./BookForm";
import BookList from "./BookList";
import { Button } from "./components";

export interface Session {
  token: string;
  username: string;
}

export type Navigate = (path: string) => void;

export function useRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash || "#/");
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash.replace(/^#/, "") || "/";
}

export default function App() {
  const route = useRoute();
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);

  const navigate = useCallback<Navigate>((path) => {
    window.location.hash = path;
  }, []);

  useEffect(() => {
    const token = getToken();
    const username = getUsername();
    if (!token || !username) {
      setChecking(false);
      return;
    }
    api
      .me()
      .then((me) => setSession({ token, username: me.username }))
      .catch(() => {
        clearSession();
        setSession(null);
      })
      .finally(() => setChecking(false));
  }, []);

  const onSignedIn = (token: string, username: string) => {
    saveSession(token, username);
    setSession({ token, username });
    navigate("/");
  };

  const onSignOut = async () => {
    try {
      await api.logout();
    } catch {
      /* session is cleared locally regardless */
    }
    clearSession();
    setSession(null);
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <a
            href="#/"
            className="text-xl font-bold tracking-tight text-indigo-700 hover:text-indigo-900"
          >
            Book Library
          </a>
          <nav className="flex items-center gap-3 text-sm">
            {session ? (
              <>
                <span className="text-slate-600">
                  Signed in as{" "}
                  <span className="font-semibold text-slate-900">
                    {session.username}
                  </span>
                </span>
                <Button variant="secondary" onClick={onSignOut}>
                  Sign out
                </Button>
              </>
            ) : (
              !checking && (
                <>
                  <Button variant="ghost" onClick={() => navigate("/login")}>
                    Sign in
                  </Button>
                  <Button onClick={() => navigate("/register")}>
                    Register
                  </Button>
                </>
              )
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        {checking ? (
          <p className="text-center text-slate-500">Loading…</p>
        ) : (
          <Router
            route={route}
            session={session}
            navigate={navigate}
            onSignedIn={onSignedIn}
          />
        )}
      </main>
    </div>
  );
}

function Router({
  route,
  session,
  navigate,
  onSignedIn,
}: {
  route: string;
  session: Session | null;
  navigate: Navigate;
  onSignedIn: (token: string, username: string) => void;
}) {
  if (route === "/login" || route === "/register") {
    return (
      <AuthForm
        mode={route === "/login" ? "login" : "register"}
        navigate={navigate}
        onSignedIn={onSignedIn}
      />
    );
  }

  const bookMatch = route.match(/^\/books\/(\d+)(\/edit)?$/);
  if (bookMatch) {
    const id = Number(bookMatch[1]);
    if (bookMatch[2] === "/edit") {
      return session ? (
        <BookForm mode="edit" bookId={id} navigate={navigate} />
      ) : (
        <SignInPrompt navigate={navigate} />
      );
    }
    return <BookDetail bookId={id} session={session} navigate={navigate} />;
  }

  if (route === "/books/new") {
    return session ? (
      <BookForm mode="create" navigate={navigate} />
    ) : (
      <SignInPrompt navigate={navigate} />
    );
  }

  return <BookList session={session} navigate={navigate} />;
}

function SignInPrompt({ navigate }: { navigate: Navigate }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
      <p className="mb-4 text-slate-600">Please sign in to continue.</p>
      <Button onClick={() => navigate("/login")}>Sign in</Button>
    </div>
  );
}
