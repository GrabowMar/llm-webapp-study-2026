import { useEffect, useState } from "react";
import { api, clearToken, errorMessage, getToken } from "./api";
import Admin from "./components/Admin";
import Attempts from "./components/Attempts";
import Auth from "./components/Auth";
import Quiz from "./components/Quiz";
import Review from "./components/Review";
import type { Attempt, OptionLetter, QuizQuestion, User } from "./types";

type View = "home" | "quiz" | "result" | "auth" | "attempts" | "attempt" | "admin";

const QUIZ_SIZE = 5;

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<View>("home");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authReturn, setAuthReturn] = useState<View>("home");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [detail, setDetail] = useState<Attempt | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      return;
    }
    api<User>("/api/auth/me")
      .then((signedIn) => setUser(signedIn))
      .catch(() => clearToken());
  }, []);

  const startQuiz = async () => {
    setError(null);
    try {
      const data = await api<{ items: QuizQuestion[] }>(`/api/quiz?count=${QUIZ_SIZE}`);
      setQuestions(data.items);
      setAttempt(null);
      setDetail(null);
      setView("quiz");
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const submitQuiz = async (answers: { question_id: number; selected: OptionLetter }[]) => {
    setError(null);
    try {
      const result = await api<Attempt>("/api/attempts", {
        method: "POST",
        body: { answers },
      });
      setAttempt(result);
      setView("result");
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const openAttempt = async (id: number) => {
    setError(null);
    try {
      const result = await api<Attempt>(`/api/attempts/${id}`);
      setDetail(result);
      setView("attempt");
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const openAuth = (mode: "login" | "register", returnView: View = "home") => {
    setAuthMode(mode);
    setAuthReturn(returnView);
    setError(null);
    setView("auth");
  };

  const onAuthSuccess = (signedIn: User) => {
    setUser(signedIn);
    setError(null);
    if (authReturn === "result" && attempt) {
      setView("result");
    } else if (authReturn === "attempts") {
      setView("attempts");
    } else {
      setView("home");
    }
  };

  const signOut = () => {
    clearToken();
    setUser(null);
    setDetail(null);
    setAttempt(null);
    setView("home");
  };

  const goHome = () => {
    setError(null);
    setView("home");
  };

  const navButton = "rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100";

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <button
            type="button"
            onClick={goHome}
            className="text-lg font-bold text-indigo-600 hover:text-indigo-700"
          >
            Quiz
          </button>
          <nav className="flex flex-wrap items-center gap-1">
            <button type="button" onClick={startQuiz} className={navButton}>
              New quiz
            </button>
            {user && (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setView("attempts");
                }}
                className={navButton}
              >
                My attempts
              </button>
            )}
            {user?.is_admin && (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setView("admin");
                }}
                className={navButton}
              >
                Admin
              </button>
            )}
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <span className="text-sm font-medium text-slate-700">{user.username}</span>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => openAuth("login")}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => openAuth("register")}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  Register
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {error && view !== "auth" && (
          <div className="mb-6 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="font-semibold hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {view === "home" && (
          <section className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h1 className="text-3xl font-bold text-slate-900">Ready for a quick quiz?</h1>
            <p className="mx-auto mt-3 max-w-lg text-slate-600">
              Draw {QUIZ_SIZE} random general-knowledge questions, answer them one at a time and
              see your score. Sign in to keep a history of your attempts.
            </p>
            <button
              type="button"
              onClick={startQuiz}
              className="mt-6 rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-700"
            >
              Start quiz
            </button>
          </section>
        )}

        {view === "quiz" && questions.length > 0 && (
          <Quiz questions={questions} onSubmit={submitQuiz} />
        )}

        {view === "result" && attempt && (
          <section className="space-y-6">
            {!user && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
                <p className="font-medium text-indigo-800">Sign in to save your results</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => openAuth("login", "result")}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={() => openAuth("register", "result")}
                    className="rounded-lg border border-indigo-300 px-3 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-white"
                  >
                    Register
                  </button>
                </div>
              </div>
            )}
            <h1 className="text-2xl font-bold text-slate-900">Result</h1>
            <Review attempt={attempt} />
            <div className="flex justify-center">
              <button
                type="button"
                onClick={startQuiz}
                className="rounded-lg bg-indigo-600 px-5 py-2 font-semibold text-white hover:bg-indigo-700"
              >
                Try another quiz
              </button>
            </div>
          </section>
        )}

        {view === "auth" && (
          <Auth mode={authMode} setMode={setAuthMode} onSuccess={onAuthSuccess} />
        )}

        {view === "attempts" && user && <Attempts onOpen={openAttempt} />}

        {view === "attempt" && detail && (
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold text-slate-900">Attempt</h1>
              <button
                type="button"
                onClick={() => setView("attempts")}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-white"
              >
                Back to attempts
              </button>
            </div>
            <p className="text-sm text-slate-500">{new Date(detail.submitted_at).toLocaleString()}</p>
            <Review attempt={detail} />
          </section>
        )}

        {view === "admin" && user?.is_admin && <Admin />}
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400">
        Quiz app
      </footer>
    </div>
  );
}
