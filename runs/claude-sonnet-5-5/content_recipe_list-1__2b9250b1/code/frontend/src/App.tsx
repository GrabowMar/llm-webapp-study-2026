import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useAuth } from "./auth";
import { AuthForm } from "./pages/AuthForm";
import { RecipeForm } from "./pages/RecipeForm";
import { RecipeList } from "./pages/RecipeList";
import { RecipePage } from "./pages/RecipePage";
import { secondaryBtn, primaryBtn } from "./ui";

function Header() {
  const { username, signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link to="/" className="text-xl font-semibold text-amber-800">
          Recipe Book
        </Link>
        <nav className="flex flex-wrap items-center gap-3 text-sm">
          {username ? (
            <>
              <Link to="/recipes/new" className={primaryBtn}>
                Add recipe
              </Link>
              <span>
                Signed in as <strong data-testid="current-user">{username}</strong>
              </span>
              <button
                type="button"
                className={secondaryBtn}
                onClick={() => {
                  signOut();
                  navigate("/");
                }}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className={secondaryBtn}>
                Sign in
              </Link>
              <Link to="/register" className={primaryBtn}>
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { username } = useAuth();
  if (!username) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Routes>
          <Route path="/" element={<RecipeList />} />
          <Route path="/login" element={<AuthForm mode="login" />} />
          <Route path="/register" element={<AuthForm mode="register" />} />
          <Route path="/recipes/new" element={<RequireAuth><RecipeForm /></RequireAuth>} />
          <Route path="/recipes/:id" element={<RecipePage />} />
          <Route path="/recipes/:id/edit" element={<RequireAuth><RecipeForm /></RequireAuth>} />
          <Route path="*" element={<p>Page not found.</p>} />
        </Routes>
      </main>
    </div>
  );
}
