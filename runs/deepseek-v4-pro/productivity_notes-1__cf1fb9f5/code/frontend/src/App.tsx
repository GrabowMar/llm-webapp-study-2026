import { Link, Route, Routes, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { NoteList } from "./pages/NoteList";
import { NotePage } from "./pages/NotePage";
import { NoteForm } from "./pages/NoteForm";
import { AuthForm } from "./pages/AuthForm";

function Shell() {
  const { username, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-lg font-bold text-slate-900">
            Notes
          </Link>
          <div className="flex items-center gap-3">
            {username ? (
              <>
                <span className="text-sm text-slate-600">
                  signed in as{" "}
                  <span className="font-medium text-slate-900">{username}</span>
                </span>
                <button
                  onClick={() => {
                    signOut();
                    navigate("/");
                  }}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
                >
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        <Routes>
          <Route path="/" element={<NoteList />} />
          <Route path="/notes/new" element={<NoteForm />} />
          <Route path="/notes/:id" element={<NotePage />} />
          <Route path="/notes/:id/edit" element={<NoteForm />} />
          <Route path="/login" element={<AuthForm mode="login" />} />
          <Route path="/register" element={<AuthForm mode="register" />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
