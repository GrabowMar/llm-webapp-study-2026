import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";

import { useAuth } from "./lib/auth";
import { AuthPage } from "./pages/AuthPage";
import { NoteDetailPage } from "./pages/NoteDetailPage";
import { NoteEditorPage } from "./pages/NoteEditorPage";
import { NoteListPage } from "./pages/NoteListPage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isSignedIn, ready } = useAuth();
  const location = useLocation();
  if (!ready) {
    return (
      <div className="px-4 py-16 text-center text-sm text-slate-500">Loading…</div>
    );
  }
  if (!isSignedIn) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

function Header() {
  const { username, isSignedIn, signOut } = useAuth();
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
            N
          </span>
          <span className="text-lg font-bold tracking-tight text-slate-900">
            Tagged Notes
          </span>
        </Link>

        <div className="flex items-center gap-3">
          {isSignedIn ? (
            <>
              <Link
                to="/notes/new"
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-700"
              >
                New note
              </Link>
              <span className="hidden text-sm text-slate-600 sm:inline">
                Signed in as{" "}
                <span className="font-medium text-slate-900">{username}</span>
              </span>
              <button
                type="button"
                onClick={signOut}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-700"
              >
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<NoteListPage />} />
          <Route path="/notes/new" element={<RequireAuth><NoteEditorPage mode="create" /></RequireAuth>} />
          <Route path="/notes/:id" element={<NoteDetailPage />} />
          <Route path="/notes/:id/edit" element={<RequireAuth><NoteEditorPage mode="edit" /></RequireAuth>} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
