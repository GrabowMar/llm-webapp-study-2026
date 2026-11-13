import { Link, Route, Routes, useNavigate } from "react-router-dom";
import { useAuth } from "./auth";
import { Button } from "./ui";
import AuthPage from "./pages/AuthPage";
import Editor from "./pages/Editor";
import PostPage from "./pages/PostPage";
import PostsPage from "./pages/PostsPage";

export default function App() {
  const { user, ready, signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <nav className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="text-lg font-bold text-indigo-700">
            Blog
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {user ? (
              <>
                <Link to="/posts/new" className="text-indigo-700 hover:underline">
                  New post
                </Link>
                <span data-testid="current-user" className="font-medium">
                  {user.username}
                </span>
                <Button
                  variant="secondary"
                  onClick={() => {
                    signOut();
                    navigate("/");
                  }}
                >
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Link to="/login" className="text-indigo-700 hover:underline">
                  Sign in
                </Link>
                <Link to="/register" className="text-indigo-700 hover:underline">
                  Register
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">
        {!ready ? (
          <p className="text-slate-500">Loading…</p>
        ) : (
          <Routes>
            <Route path="/" element={<PostsPage />} />
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/register" element={<AuthPage mode="register" />} />
            <Route path="/posts/new" element={<Editor />} />
            <Route path="/posts/:id" element={<PostPage />} />
            <Route path="/posts/:id/edit" element={<Editor />} />
            <Route path="*" element={<p>Page not found.</p>} />
          </Routes>
        )}
      </main>
    </div>
  );
}
