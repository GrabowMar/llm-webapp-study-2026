import { Link, Route, Routes, useNavigate } from "react-router-dom";
import AuthForm from "./AuthForms";
import { useAuth } from "./auth";
import NoteForm from "./NoteForm";
import NoteList from "./NoteList";
import NotePage from "./NotePage";
import { btn, btnGhost } from "./ui";

export default function App() {
  const { username, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <Link to="/" className="text-lg font-bold text-indigo-700">
            Tagged notes
          </Link>
          <nav className="flex items-center gap-2">
            {username ? (
              <>
                <Link to="/notes/new" className={btn}>
                  New note
                </Link>
                <span className="text-sm text-slate-600">
                  Signed in as <strong data-testid="username">{username}</strong>
                </span>
                <button
                  className={btnGhost}
                  onClick={() => {
                    logout();
                    navigate("/");
                  }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className={btnGhost}>
                  Sign in
                </Link>
                <Link to="/register" className={btn}>
                  Register
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">
        <Routes>
          <Route path="/" element={<NoteList />} />
          <Route path="/login" element={<AuthForm mode="login" />} />
          <Route path="/register" element={<AuthForm mode="register" />} />
          <Route path="/notes/new" element={<NoteForm />} />
          <Route path="/notes/:id" element={<NotePage />} />
          <Route path="/notes/:id/edit" element={<NoteForm />} />
          <Route path="*" element={<p className="text-slate-500">Page not found.</p>} />
        </Routes>
      </main>
    </div>
  );
}
