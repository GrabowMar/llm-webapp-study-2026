import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { clearAuth, loadAuth, saveAuth } from "./api";
import type { Auth } from "./api";
import { Link, navigate, useLocation } from "./router";
import AuthPage from "./pages/AuthPage";
import Editor from "./pages/Editor";
import PostList from "./pages/PostList";
import PostPage from "./pages/PostPage";

function NotFound() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-slate-600">The page you are looking for does not exist.</p>
      <Link to="/" className="mt-4 inline-block font-medium text-indigo-700 hover:underline">
        Back to all posts
      </Link>
    </div>
  );
}

export default function App() {
  const [auth, setAuth] = useState<Auth | null>(() => loadAuth());
  const { pathname, search } = useLocation();

  const signIn = useCallback((next: Auth) => {
    saveAuth(next);
    setAuth(next);
    navigate("/");
  }, []);

  const signOut = useCallback(() => {
    clearAuth();
    setAuth(null);
    navigate("/");
  }, []);

  let page: ReactNode;
  if (pathname === "/") {
    page = <PostList auth={auth} search={search} />;
  } else if (pathname === "/login") {
    page = <AuthPage mode="login" onSignIn={signIn} />;
  } else if (pathname === "/register") {
    page = <AuthPage mode="register" onSignIn={signIn} />;
  } else if (pathname === "/new") {
    page = <Editor auth={auth} />;
  } else {
    const editMatch = pathname.match(/^\/posts\/(\d+)\/edit\/?$/);
    const postMatch = pathname.match(/^\/posts\/(\d+)\/?$/);
    if (editMatch) {
      page = <Editor auth={auth} postId={Number(editMatch[1])} />;
    } else if (postMatch) {
      page = <PostPage auth={auth} postId={Number(postMatch[1])} />;
    } else {
      page = <NotFound />;
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link to="/" className="text-lg font-bold tracking-tight text-indigo-700">
            Multi-Author Blog
          </Link>
          <nav className="flex flex-wrap items-center gap-3 text-sm">
            {auth ? (
              <>
                <Link
                  to="/new"
                  className="rounded bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-700"
                >
                  New post
                </Link>
                <span className="text-slate-600">
                  Signed in as{" "}
                  <span className="font-semibold text-slate-900">{auth.username}</span>
                </span>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  className="rounded bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-700"
                >
                  Register
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{page}</main>
    </div>
  );
}
