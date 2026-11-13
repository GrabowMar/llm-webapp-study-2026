import { useCallback, useEffect, useState } from "react";
import { api, getToken, setToken } from "./api";
import AdminView from "./components/AdminView";
import AuthModal from "./components/AuthModal";
import HistoryView from "./components/HistoryView";
import QuizView from "./components/QuizView";
import ResultView from "./components/ResultView";
import type {
  Attempt,
  AttemptAnswerInput,
  QuizQuestion,
  User,
} from "./types";

type View =
  | { name: "home" }
  | { name: "quiz" }
  | { name: "result"; attempt: Attempt; isGuest: boolean }
  | { name: "history" }
  | { name: "attempt"; attempt: Attempt }
  | { name: "admin" };

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [view, setView] = useState<View>({ name: "home" });
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [count, setCount] = useState(5);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [loadingAttempt, setLoadingAttempt] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      return;
    }
    api<User>("/api/auth/me")
      .then(setUser)
      .catch(() => {
        setToken(null);
        setUser(null);
      });
  }, []);

  const openAuth = (mode: "login" | "register") => {
    setAuthMode(mode);
    setAuthOpen(true);
  };

  async function handleSignOut() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    setToken(null);
    setUser(null);
    setView({ name: "home" });
  }

  const startQuiz = useCallback(async () => {
    setStarting(true);
    setStartError(null);
    try {
      const data = await api<{ items: QuizQuestion[] }>(
        `/api/quiz?count=${count}`,
        { auth: false },
      );
      if (data.items.length === 0) {
        setStartError("No questions are available yet. Please try again later.");
        return;
      }
      setQuestions(data.items);
      setView({ name: "quiz" });
    } catch (err) {
      setStartError((err as Error).message);
    } finally {
      setStarting(false);
    }
  }, [count]);

  async function submitAnswers(answers: AttemptAnswerInput[]) {
    const attempt = await api<Attempt>("/api/attempts", {
      method: "POST",
      body: { answers },
    });
    const saved = attempt.id !== null;
    if (saved) {
      setHistoryRefresh((value) => value + 1);
    }
    setView({ name: "result", attempt, isGuest: !saved });
  }

  async function handleAuthenticated(authenticated: User) {
    setUser(authenticated);
    setAuthOpen(false);
    if (authenticated.is_admin) {
      setView({ name: "admin" });
      return;
    }
    if (view.name === "result" && view.isGuest) {
      try {
        const saved = await api<Attempt>("/api/attempts", {
          method: "POST",
          body: {
            answers: view.attempt.answers.map((answer) => ({
              question_id: answer.question_id,
              selected: answer.selected,
            })),
          },
        });
        if (saved.id !== null) {
          setHistoryRefresh((value) => value + 1);
          setView({ name: "result", attempt: saved, isGuest: false });
        }
      } catch {
        /* ignore */
      }
    }
  }

  async function openAttempt(id: number) {
    setLoadingAttempt(true);
    try {
      const attempt = await api<Attempt>(`/api/attempts/${id}`);
      setView({ name: "attempt", attempt });
    } catch (err) {
      window.alert((err as Error).message);
    } finally {
      setLoadingAttempt(false);
    }
  }

  const navButton =
    "rounded-lg px-3 py-2 text-sm font-semibold transition hover:bg-slate-100";
  const activeNav = "bg-indigo-50 text-indigo-700";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => setView({ name: "home" })}
            className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-slate-900"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-black text-white">
              Q
            </span>
            Quizly
          </button>

          <nav className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setView({ name: "home" })}
              className={`${navButton} ${view.name === "home" ? activeNav : "text-slate-600"}`}
            >
              Play
            </button>
            {user && (
              <button
                type="button"
                onClick={() => setView({ name: "history" })}
                className={`${navButton} ${
                  view.name === "history" || view.name === "attempt"
                    ? activeNav
                    : "text-slate-600"
                }`}
              >
                History
              </button>
            )}
            {user?.is_admin && (
              <button
                type="button"
                onClick={() => setView({ name: "admin" })}
                className={`${navButton} ${view.name === "admin" ? activeNav : "text-slate-600"}`}
              >
                Admin
              </button>
            )}

            <span className="mx-2 hidden h-6 w-px bg-slate-200 sm:block" />

            {user ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600">
                  Signed in as{" "}
                  <span className="font-semibold text-slate-900">
                    {user.username}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openAuth("login")}
                  className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => openAuth("register")}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
                >
                  Register
                </button>
              </div>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        {loadingAttempt && (
          <p className="mb-4 text-center text-sm text-indigo-600">
            Loading attempt…
          </p>
        )}

        {view.name === "home" && (
          <section className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
              Test your knowledge
            </h1>
            <p className="mt-4 text-lg text-slate-600">
              Take a short multiple-choice quiz on general knowledge. Sign in to
              keep a record of every attempt.
            </p>

            <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                How many questions?
              </label>
              <div className="mb-6 flex justify-center gap-2">
                {[5, 10, 15].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setCount(value)}
                    className={`rounded-lg px-5 py-2 font-semibold transition ${
                      count === value
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>

              {startError && (
                <div className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {startError}
                </div>
              )}

              <button
                type="button"
                onClick={startQuiz}
                disabled={starting}
                className="w-full rounded-xl bg-indigo-600 px-6 py-3 text-lg font-bold text-white shadow transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {starting ? "Preparing…" : `Start quiz (${count} questions)`}
              </button>

              {!user && (
                <p className="mt-4 text-sm text-slate-500">
                  Playing as a visitor — your result won't be saved.{" "}
                  <button
                    type="button"
                    onClick={() => openAuth("login")}
                    className="font-semibold text-indigo-600 hover:text-indigo-700"
                  >
                    Sign in
                  </button>{" "}
                  to save results.
                </p>
              )}
            </div>

            {user && user.is_admin && (
              <p className="mt-6 text-sm text-slate-500">
                You're signed in as the admin.{" "}
                <button
                  type="button"
                  onClick={() => setView({ name: "admin" })}
                  className="font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  Manage questions
                </button>
              </p>
            )}
          </section>
        )}

        {view.name === "quiz" && (
          <QuizView
            questions={questions}
            onSubmit={submitAnswers}
            onCancel={() => setView({ name: "home" })}
          />
        )}

        {view.name === "result" && (
          <ResultView
            attempt={view.attempt}
            isGuest={view.isGuest}
            signedIn={user !== null}
            onSignIn={() => openAuth("login")}
            onRestart={() => setView({ name: "home" })}
          />
        )}

        {(view.name === "history" || view.name === "attempt") && (
          <div className="mx-auto max-w-3xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">
                  {view.name === "attempt" ? "Attempt review" : "Your history"}
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  {view.name === "attempt"
                    ? "Every question from this saved attempt."
                    : "Your saved quiz attempts, newest first."}
                </p>
              </div>
              {view.name === "attempt" && (
                <button
                  type="button"
                  onClick={() => setView({ name: "history" })}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
                >
                  Back to history
                </button>
              )}
            </div>

            {view.name === "history" ? (
              <HistoryView
                refreshKey={historyRefresh}
                onOpenAttempt={(attempt) => {
                  if (attempt.id !== null) {
                    openAttempt(attempt.id);
                  }
                }}
              />
            ) : (
              <ResultView
                attempt={view.attempt}
                isGuest={false}
                signedIn={user !== null}
                onSignIn={() => openAuth("login")}
                onRestart={() => setView({ name: "home" })}
                title="Saved attempt"
              />
            )}
          </div>
        )}

        {view.name === "admin" && user?.is_admin && (
          <div className="mx-auto max-w-4xl">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-slate-900">
                Question management
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Add questions and browse the full catalogue.
              </p>
            </div>
            <AdminView refreshKey={historyRefresh} />
          </div>
        )}
      </main>

      {authOpen && (
        <AuthModal
          initialMode={authMode}
          onClose={() => setAuthOpen(false)}
          onAuthenticated={handleAuthenticated}
        />
      )}
    </div>
  );
}
