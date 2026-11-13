import { useEffect, useState } from "react";
import { session, setUnauthorizedHandler } from "./api";
import AuthForm from "./AuthForm";
import NotesPage from "./NotesPage";
import PublicPage from "./PublicPage";
import { secondaryBtn } from "./ui";

const publicMatch = () => window.location.pathname.match(/^\/p\/(\d+)\/?$/);

export default function App() {
  const [username, setUsername] = useState<string | null>(
    session.token ? session.username : null,
  );

  useEffect(() => {
    setUnauthorizedHandler(() => {
      session.clear();
      setUsername(null);
    });
  }, []);

  const match = publicMatch();
  if (match) return <PublicPage id={Number(match[1])} />;

  if (!username) {
    return (
      <AuthForm
        onSignedIn={(name, token) => {
          session.set(token, name);
          setUsername(name);
        }}
      />
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <h1 className="text-lg font-semibold">Markdown notes</h1>
        <div className="flex items-center gap-3 text-sm">
          <span data-testid="username">
            Signed in as <strong>{username}</strong>
          </span>
          <button
            className={secondaryBtn}
            onClick={() => {
              session.clear();
              setUsername(null);
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <NotesPage />
    </div>
  );
}

