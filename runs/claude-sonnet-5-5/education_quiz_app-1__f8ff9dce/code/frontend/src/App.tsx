import { useCallback, useEffect, useState } from "react";
import { ApiError, Attempt, Me, api, getToken, setToken } from "./api";
import AuthForms from "./components/AuthForms";
import QuizView from "./components/QuizView";
import ResultView from "./components/ResultView";
import HistoryView from "./components/HistoryView";
import AdminView from "./components/AdminView";
import { btnPrimary, btnSecondary } from "./ui";

type View = "home" | "quiz" | "result" | "history" | "attempt" | "admin" | "auth";

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>("home");
  const [result, setResult] = useState<Attempt | null>(null);

  useEffect(() => {
    if (!getToken()) {
      setReady(true);
      return;
    }
    api<Me>("/auth/me")
      .then(setMe)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) setToken(null);
      })
      .finally(() => setReady(true));
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setMe(null);
    setResult(null);
    setView("home");
  }, []);

  const onSignedIn = async () => {
    const info = await api<Me>("/auth/me");
    setMe(info);
    setView("home");
  };

  const nav = (v: View) => () => setView(v);

  if (!ready) return <div className="p-8 text-center text-slate-500">Loading…</div>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-4 py-3">
          <button onClick={nav("home")} className="text-lg font-bold text-indigo-700">
            Quiz
          </button>
          <nav className="flex flex-1 flex-wrap gap-2 text-sm">
            {me && (
              <button onClick={nav("history")} className="rounded px-2 py-1 hover:bg-slate-100">
                My attempts
              </button>
            )}
            {me?.is_admin && (
              <button onClick={nav("admin")} className="rounded px-2 py-1 hover:bg-slate-100">
                Admin
              </button>
            )}
          </nav>
          {me ? (
            <div className="flex items-center gap-3 text-sm">
              <span>
                Signed in as <strong data-testid="username">{me.username}</strong>
              </span>
              <button onClick={signOut} className={btnSecondary}>
                Sign out
              </button>
            </div>
          ) : (
            <button onClick={nav("auth")} className={btnSecondary}>
              Sign in / Register
            </button>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">
        {view === "home" && (
          <section className="rounded-lg bg-white p-6 text-center shadow">
            <h1 className="mb-2 text-2xl font-bold">General knowledge quiz</h1>
            <p className="mb-6 text-slate-600">Answer 5 random multiple-choice questions.</p>
            <button onClick={nav("quiz")} className={btnPrimary}>
              Start quiz
            </button>
          </section>
        )}
        {view === "quiz" && (
          <QuizView
            onSessionExpired={signOut}
            onDone={(r) => {
              setResult(r);
              setView("result");
            }}
          />
        )}
        {view === "result" && result && (
          <ResultView
            attempt={result}
            signedIn={!!me}
            onSignIn={nav("auth")}
            onAgain={nav("quiz")}
          />
        )}
        {view === "history" && me && <HistoryView onExpired={signOut} />}
        {view === "admin" && me?.is_admin && <AdminView onExpired={signOut} />}
        {view === "auth" && !me && <AuthForms onSignedIn={onSignedIn} />}
      </main>
    </div>
  );
}
