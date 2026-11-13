import { useEffect, useState } from "react";
import Admin from "./Admin";
import { Attempt, clearAuth, getUsername } from "./api";
import Attempts from "./Attempts";
import Auth from "./Auth";
import Quiz from "./Quiz";
import Result from "./Result";

type View =
  | { name: "home" }
  | { name: "auth" }
  | { name: "quiz" }
  | { name: "result"; attempt: Attempt }
  | { name: "attempts" }
  | { name: "admin" };

const QUIZ_SIZE = 5;

export default function App() {
  const [authed, setAuthed] = useState(() => getUsername() !== null);
  const [isAdmin, setIsAdmin] = useState(() => getUsername() === "admin");
  const [view, setView] = useState<View>({ name: "home" });

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === "Enter" && view.name === "quiz") {
        // handled by buttons; no global shortcut
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [view]);
  function signOut() {
    clearAuth();
    setAuthed(false);
    setIsAdmin(false);
    setView({ name: "home" });
  }

  const username = getUsername();

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="bg-white border-b">
        <div className="max-w-2xl mx-auto flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setView({ name: "home" })}
            className="font-bold text-lg"
          >
            Quiz App
          </button>
          <nav className="flex items-center gap-3 text-sm">
            <button
              onClick={() => setView({ name: "home" })}
              className="text-blue-600"
            >
              Play
            </button>
            {authed && (
              <>
                <button
                  onClick={() => setView({ name: "attempts" })}
                  className="text-blue-600"
                >
                  My attempts
                </button>
                {isAdmin && (
                  <button
                    onClick={() => setView({ name: "admin" })}
                    className="text-blue-600"
                  >
                    Admin
                  </button>
                )}
              </>
            )}
            {authed ? (
              <span className="flex items-center gap-2">
                <span className="text-gray-600">{username}</span>
                <button
                  onClick={signOut}
                  className="border rounded px-2 py-1 hover:bg-gray-100"
                >
                  Sign out
                </button>
              </span>
            ) : (
              <button
                onClick={() => setView({ name: "auth" })}
                className="border rounded px-2 py-1 hover:bg-gray-100"
              >
                Sign in
              </button>
            )}
          </nav>
        </div>
      </header>

      <main className="px-4 pb-12">
        {view.name === "home" && (
          <Quiz count={QUIZ_SIZE} isAuthed={authed} onResult={(a) => setView({ name: "result", attempt: a })} />
        )}
        {view.name === "quiz" && (
          <Quiz count={QUIZ_SIZE} isAuthed={authed} onResult={(a) => setView({ name: "result", attempt: a })} />
        )}
        {view.name === "result" && (
          <Result
            attempt={view.attempt}
            isAuthed={authed}
            onNewQuiz={() => setView({ name: "quiz" })}
            onSignIn={() => setView({ name: "auth" })}
          />
        )}
        {view.name === "auth" && (
          <Auth
            isAdmin={isAdmin}
            onAuthed={() => {
              setAuthed(true);
              setIsAdmin(getUsername() === "admin");
              setView({ name: "home" });
            }}
          />
        )}
        {view.name === "attempts" && <Attempts />}
        {view.name === "admin" && <Admin />}
      </main>
    </div>
  );
}
