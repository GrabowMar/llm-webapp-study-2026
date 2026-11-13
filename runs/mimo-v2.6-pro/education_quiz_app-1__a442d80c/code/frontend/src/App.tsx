import { useState } from "react";
import { clearSession, loadSession, saveSession, type Session } from "./api";
import Admin from "./components/Admin";
import { AttemptDetail, Attempts } from "./components/Attempts";
import Auth from "./components/Auth";
import Quiz from "./components/Quiz";
import ResultView from "./components/ResultView";
import type { Attempt } from "./types";

type View =
  | { name: "home" }
  | { name: "quiz"; count: number }
  | { name: "result"; attempt: Attempt }
  | { name: "attempts" }
  | { name: "attempt"; id: number }
  | { name: "auth"; mode: "signin" | "register" }
  | { name: "admin" };

const COUNT_OPTIONS = [5, 10, 15];

export default function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [view, setView] = useState<View>({ name: "home" });
  const [quizCount, setQuizCount] = useState(5);

  const signIn = (token: string, username: string) => {
    saveSession({ token, username });
    setSession({ token, username });
    setView({ name: "home" });
  };

  const signOut = () => {
    clearSession();
    setSession(null);
    setView({ name: "home" });
  };

  const isAdmin = session?.username === "admin";

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <button
            type="button"
            onClick={() => setView({ name: "home" })}
            className="text-lg font-bold text-slate-900"
          >
            Quiz App
          </button>
          <nav className="flex flex-1 flex-wrap items-center gap-1 text-sm font-medium">
            <button
              type="button"
              onClick={() => setView({ name: "home" })}
              className={`rounded-md px-3 py-1.5 ${
                view.name === "home" || view.name === "quiz"
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              New quiz
            </button>
            {session ? (
              <button
                type="button"
                onClick={() => setView({ name: "attempts" })}
                className={`rounded-md px-3 py-1.5 ${
                  view.name === "attempts" || view.name === "attempt"
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                My attempts
              </button>
            ) : null}
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setView({ name: "admin" })}
                className={`rounded-md px-3 py-1.5 ${
                  view.name === "admin"
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                Admin
              </button>
            ) : null}
          </nav>
          <div className="flex items-center gap-2 text-sm">
            {session ? (
              <>
                <span className="text-slate-600">
                  Signed in as <span className="font-semibold text-slate-900">{session.username}</span>
                </span>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded-lg bg-white px-3 py-1.5 font-medium text-slate-700 shadow-sm ring-1 ring-slate-300 hover:bg-slate-50"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setView({ name: "auth", mode: "signin" })}
                  className={`rounded-lg px-3 py-1.5 font-medium ${
                    view.name === "auth"
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => setView({ name: "auth", mode: "register" })}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-700"
                >
                  Register
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {view.name === "home" ? (
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-3xl font-bold text-slate-900">Test your general knowledge</h1>
            <p className="mt-3 text-slate-600">
              Answer a short quiz of multiple-choice questions and see how you score.{" "}
              {session ? "Your attempts are saved to your account." : "Sign in to keep a history of your attempts."}
            </p>
            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <label htmlFor="quiz-count" className="block text-sm font-medium text-slate-700">
                Number of questions
              </label>
              <select
                id="quiz-count"
                value={quizCount}
                onChange={(e) => setQuizCount(Number(e.target.value))}
                className="mt-2 w-40 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                {COUNT_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setView({ name: "quiz", count: quizCount })}
                  className="rounded-lg bg-indigo-600 px-6 py-2.5 font-medium text-white hover:bg-indigo-700"
                >
                  Start quiz
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {view.name === "quiz" ? (
          <Quiz
            count={view.count}
            onFinished={(attempt) => setView({ name: "result", attempt })}
            onExit={() => setView({ name: "home" })}
          />
        ) : null}

        {view.name === "result" ? (
          <ResultView
            attempt={view.attempt}
            signedIn={session !== null}
            onSignIn={() => setView({ name: "auth", mode: "signin" })}
            onStartQuiz={() => setView({ name: "home" })}
            onShowAttempts={() => setView({ name: "attempts" })}
          />
        ) : null}

        {view.name === "attempts" ? (
          <Attempts onOpen={(id) => setView({ name: "attempt", id })} />
        ) : null}

        {view.name === "attempt" ? (
          <AttemptDetail id={view.id} onBack={() => setView({ name: "attempts" })} />
        ) : null}

        {view.name === "auth" ? (
          <Auth
            mode={view.mode}
            onModeChange={(mode) => setView({ name: "auth", mode })}
            onSignedIn={signIn}
          />
        ) : null}

        {view.name === "admin" ? <Admin /> : null}
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-sm text-slate-500">
        Quiz App &mdash; general knowledge quizzes for everyone.
      </footer>
    </div>
  );
}
