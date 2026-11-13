import { useEffect, useState } from "react";
import { AuthForm } from "./AuthForms";
import { setUnauthorizedHandler, session } from "./api";
import { BookForm } from "./BookForm";
import { BookList } from "./BookList";
import { BookPage } from "./BookPage";
import { Link, navigate, usePath } from "./router";
import { btnSecondary } from "./ui";

export default function App() {
  const path = usePath();
  const [username, setUsername] = useState<string | null>(session.token ? session.username : null);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      session.clear();
      setUsername(null);
    });
  }, []);

  function signOut() {
    session.clear();
    setUsername(null);
    navigate("/");
  }

  const signedIn = username !== null;
  let page;
  let m: RegExpMatchArray | null;
  if (path === "/login") page = <AuthForm mode="login" onSignedIn={setUsername} onNavigate={navigate} />;
  else if (path === "/register")
    page = <AuthForm mode="register" onSignedIn={setUsername} onNavigate={navigate} />;
  else if (path === "/books/new")
    page = signedIn ? <BookForm key="new" /> : <AuthForm mode="login" onSignedIn={setUsername} onNavigate={navigate} />;
  else if ((m = path.match(/^\/books\/(\d+)\/edit\/?$/)))
    page = signedIn ? (
      <BookForm key={m[1]} id={Number(m[1])} />
    ) : (
      <AuthForm mode="login" onSignedIn={setUsername} onNavigate={navigate} />
    );
  else if ((m = path.match(/^\/books\/(\d+)\/?$/)))
    page = <BookPage key={m[1]} id={Number(m[1])} signedIn={signedIn} />;
  else page = <BookList signedIn={signedIn} />;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-lg font-semibold">
            Book library
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            {signedIn ? (
              <>
                <span>
                  Signed in as <strong>{username}</strong>
                </span>
                <button className={btnSecondary} onClick={signOut}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="text-indigo-600 hover:underline">
                  Sign in
                </Link>
                <Link to="/register" className="text-indigo-600 hover:underline">
                  Register
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">{page}</main>
    </div>
  );
}
