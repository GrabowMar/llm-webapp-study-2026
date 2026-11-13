import { useCallback, useEffect, useState } from "react";
import useHashRoute, { navigate } from "./router";
import { getToken, setToken } from "./api";
import AuthPage from "./components/AuthPage";
import BookList from "./components/BookList";
import BookDetail from "./components/BookDetail";
import BookForm from "./components/BookForm";

export default function App() {
  const hash = useHashRoute();
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [username, setUsername] = useState<string | null>(() =>
    getToken() ? localStorage.getItem("booklib.username") : null,
  );
  const [listKey, setListKey] = useState(0);

  useEffect(() => {
    setToken(token);
  }, [token]);

  const onAuthed = useCallback((t: string, user: string) => {
    setTokenState(t);
    setUsername(user);
    localStorage.setItem("booklib.username", user);
    navigate("/");
  }, []);

  const signOut = () => {
    setTokenState(null);
    setUsername(null);
    localStorage.removeItem("booklib.username");
    navigate("/");
  };

  const onChanged = useCallback(() => setListKey((k) => k + 1), []);

  const authed = !!token;
  const route = hash.replace(/^#/, "") || "/";

  let content: React.ReactNode;
  const bookMatch = /^\/books\/(\d+)$/.exec(route);
  const editMatch = /^\/books\/(\d+)\/edit$/.exec(route);

  if (route === "/login") {
    content = authed ? <BookList key={`list-${listKey}`} authed={authed} /> : <AuthPage onAuthed={onAuthed} />;
  } else if (route === "/books/new" || editMatch) {
    content = authed ? (
      route === "/books/new" ? (
        <BookForm bookId={null} onSaved={onChanged} />
      ) : (
        <BookForm key={route} bookId={Number(editMatch![1])} onSaved={onChanged} />
      )
    ) : (
      <AuthPage onAuthed={onAuthed} />
    );
  } else if (bookMatch) {
    content = (
      <BookDetail
        key={route}
        bookId={Number(bookMatch[1])}
        authed={authed}
        username={username}
        onChanged={onChanged}
      />
    );
  } else {
    content = <BookList key={`list-${listKey}`} authed={authed} />;
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <a href="#/" className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <span aria-hidden="true">📚</span> Book library
          </a>
          <nav className="flex items-center gap-4 text-sm">
            {authed ? (
              <>
                <span className="hidden text-slate-600 sm:inline">
                  Signed in as <span className="font-semibold text-slate-900">{username}</span>
                </span>
                <button
                  onClick={signOut}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Sign out
                </button>
              </>
            ) : (
              <a
                href="#/login"
                className="rounded-md bg-indigo-600 px-3 py-1.5 font-semibold text-white shadow-sm hover:bg-indigo-500"
              >
                Sign in
              </a>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{content}</main>
    </div>
  );
}
