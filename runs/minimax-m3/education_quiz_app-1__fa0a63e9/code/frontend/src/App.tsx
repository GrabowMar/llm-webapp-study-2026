import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiRequest, clearToken, getToken } from "@/api";
import type { User } from "@/types";
import AuthPanel from "./components/AuthPanel";
import AdminPanel from "./components/AdminPanel";
import HistoryPanel from "./components/HistoryPanel";
import QuizPanel from "./components/QuizPanel";

type Tab = "quiz" | "history" | "admin";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>("quiz");
  const [booting, setBooting] = useState(true);
  const authRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      if (!getToken()) {
        setBooting(false);
        return;
      }
      try {
        const me = await apiRequest<User>("/api/auth/me");
        if (!cancelled) setUser(me);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) clearToken();
      } finally {
        if (!cancelled) setBooting(false);
      }
    };
    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = useCallback(() => {
    clearToken();
    setUser(null);
    setTab("quiz");
  }, []);

  const scrollToAuth = useCallback(() => {
    authRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const tabs: { id: Tab; label: string }[] = [
    { id: "quiz", label: "Quiz" },
    ...(user ? [{ id: "history" as Tab, label: "My attempts" }] : []),
    ...(user?.is_admin ? [{ id: "admin" as Tab, label: "Admin" }] : []),
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-lg font-black text-white">
              ?
            </span>
            <div>
              <h1 className="text-lg font-bold leading-tight text-slate-900">Quiz</h1>
              <p className="text-xs text-slate-500">Test your general knowledge</p>
            </div>
          </div>

          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">
                Signed in as{" "}
                <span className="font-semibold text-slate-900">{user.username}</span>
              </span>
              <button
                type="button"
                onClick={signOut}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={scrollToAuth}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      {user && (
        <nav className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-4xl gap-1 px-4 sm:px-6">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`-mb-px border-b-2 px-4 py-3 text-sm font-semibold transition ${
                  tab === item.id
                    ? "border-indigo-600 text-indigo-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </nav>
      )}

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        {booting ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : tab === "quiz" ? (
          <QuizPanel isSignedIn={Boolean(user)} onRequireSignIn={scrollToAuth} />
        ) : tab === "history" ? (
          <HistoryPanel />
        ) : (
          <AdminPanel />
        )}
      </main>

      {!user && tab === "quiz" && (
        <div ref={authRef} className="mx-auto max-w-4xl px-4 pb-12 sm:px-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-lg font-bold text-slate-900">Sign in or register</h2>
            <p className="mt-1 text-sm text-slate-500">
              Playing as a visitor is fine, but a signed-in account keeps a history of your
              attempts.
            </p>
            <div className="mt-5">
              <AuthPanel onAuthenticated={setUser} />
            </div>
          </div>
        </div>
      )}

      <footer className="mx-auto max-w-4xl px-4 pb-10 text-center text-xs text-slate-400 sm:px-6">
        Built with Flask and React.
      </footer>
    </div>
  );
}
