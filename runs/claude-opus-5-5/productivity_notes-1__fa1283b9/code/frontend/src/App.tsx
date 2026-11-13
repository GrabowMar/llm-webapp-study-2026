import { AuthProvider, useAuth } from "./auth";
import AuthForm from "./pages/AuthForm";
import NoteForm from "./pages/NoteForm";
import NoteList from "./pages/NoteList";
import NoteView from "./pages/NoteView";
import { Link, navigate, useLocation } from "./router";

function Header() {
  const { username, logout } = useAuth();
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link to="/" className="text-lg font-bold text-indigo-600">
          Tagged notes
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          {username ? (
            <>
              <span className="text-slate-600">
                Signed in as <strong className="text-slate-900">{username}</strong>
              </span>
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
                onClick={async () => {
                  await logout();
                  navigate("/");
                }}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="font-medium text-slate-700 hover:text-indigo-600">
                Sign in
              </Link>
              <Link
                to="/register"
                className="rounded-md bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-500"
              >
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function Routes() {
  const { pathname, search } = useLocation();
  const { ready } = useAuth();
  if (!ready) return <p className="text-slate-500">Loading…</p>;

  if (pathname === "/") return <NoteList search={search} />;
  if (pathname === "/login") return <AuthForm key="login" mode="login" />;
  if (pathname === "/register") return <AuthForm key="register" mode="register" />;
  if (pathname === "/notes/new") return <NoteForm key="new" />;
  let m = pathname.match(/^\/notes\/(\d+)\/edit\/?$/);
  if (m) return <NoteForm key={`edit-${m[1]}`} id={Number(m[1])} />;
  m = pathname.match(/^\/notes\/(\d+)\/?$/);
  if (m) return <NoteView id={Number(m[1])} />;
  return (
    <div className="text-center">
      <h1 className="mb-2 text-2xl font-bold">Page not found</h1>
      <Link to="/" className="text-indigo-600 hover:underline">
        Go to notes
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <Header />
        <main className="mx-auto max-w-5xl px-4 py-6">
          <Routes />
        </main>
      </div>
    </AuthProvider>
  );
}
