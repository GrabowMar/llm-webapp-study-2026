import { useCallback, useEffect, useState } from "react";
import { api, getToken, setToken, type Attempt, type User } from "./api";
import Admin from "./components/Admin";
import AuthForm from "./components/AuthForm";
import History from "./components/History";
import Quiz from "./components/Quiz";
import Result from "./components/Result";

type View = "quiz" | "result" | "login" | "register" | "history" | "admin";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>("quiz");
  const [result, setResult] = useState<Attempt | null>(null);
  const [quizKey, setQuizKey] = useState(0);

  useEffect(() => {
    if (!getToken()) {
      setReady(true);
      return;
    }
    api
      .me()
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, []);

  const signOutLocal = useCallback(() => {
    setToken(null);
    setUser(null);
    setView("login");
  }, []);

  async function signOut() {
    try {
      await api.logout();
    } catch {
      /* token may already be invalid */
    }
    setToken(null);
    setUser(null);
    setResult(null);
    setView("quiz");
  }

  function newQuiz() {
    setResult(null);
    setQuizKey((k) => k + 1);
    setView("quiz");
  }

  const navBtn = (v: View, label: string, onClick?: () => void) => (
    <button
      type="button"
      onClick={onClick ?? (() => setView(v))}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${
        view === v ? "bg-indigo-100 text-indigo-700" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <button type="button" onClick={newQuiz} className="text-xl font-bold text-indigo-600">
            Quiz
          </button>
          <nav className="flex flex-wrap items-center gap-1">
            {navBtn("quiz", "Take quiz", newQuiz)}
            {user && navBtn("history", "My attempts")}
            {user?.is_admin && navBtn("admin", "Admin")}
            {ready &&
              (user ? (
                <span className="ml-2 flex items-center gap-2">
                  <span className="text-sm text-slate-600">
                    Signed in as <strong data-testid="username">{user.username}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={signOut}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                  >
                    Sign out
                  </button>
                </span>
              ) : (
                <>
                  {navBtn("login", "Sign in")}
                  {navBtn("register", "Register")}
                </>
              ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">
        {view === "quiz" && (
          <Quiz
            key={quizKey}
            onFinished={(a) => {
              setResult(a);
              setView("result");
            }}
          />
        )}
        {view === "result" && result && (
          <Result
            attempt={result}
            signedIn={!!user}
            onSignIn={() => setView("login")}
            onAgain={newQuiz}
          />
        )}
        {(view === "login" || view === "register") && (
          <AuthForm
            key={view}
            mode={view}
            onSwitch={setView}
            onSignedIn={(u) => {
              setUser(u);
              setView(u.is_admin ? "admin" : "quiz");
              setQuizKey((k) => k + 1);
            }}
          />
        )}
        {view === "history" && user && <History onUnauthorized={signOutLocal} />}
        {view === "admin" && user?.is_admin && <Admin onUnauthorized={signOutLocal} />}
      </main>
    </div>
  );
}
