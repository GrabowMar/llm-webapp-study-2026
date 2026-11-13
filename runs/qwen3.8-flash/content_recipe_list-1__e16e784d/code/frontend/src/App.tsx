import { Link, Route, Routes, useNavigate } from "react-router-dom";
import { ChefHat, LogOut, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "./AuthContext";
import AuthPage from "./pages/AuthPage";
import RecipeList from "./pages/RecipeList";
import RecipeDetail from "./pages/RecipeDetail";
import RecipeForm from "./pages/RecipeForm";

function Header() {
  const { username, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <ChefHat className="h-5 w-5" />
          </span>
          Recipe Book
        </Link>
        <nav className="flex items-center gap-3">
          {username ? (
            <>
              <span className="hidden text-sm text-slate-600 sm:inline">
                Signed in as <strong className="font-semibold text-slate-900">{username}</strong>
              </span>
              <Link
                to="/recipes/new"
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-700"
              >
                <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Add recipe</span>
              </Link>
              <button
                onClick={async () => {
                  await signOut();
                  navigate("/");
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-700"
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

function Protected({ children }: { children: React.ReactNode }) {
  const { username } = useAuth();
  if (!username) return <AuthPage mode="login" />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <Header />
        <Routes>
          <Route path="/" element={<RecipeList />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/recipes/new" element={<Protected><RecipeForm /></Protected>} />
          <Route path="/recipes/:id" element={<RecipeDetail />} />
          <Route
            path="/recipes/:id/edit"
            element={
              <Protected>
                <RecipeForm />
              </Protected>
            }
          />
          <Route
            path="*"
            element={
              <div className="mx-auto max-w-3xl px-4 py-16 text-center">
                <h1 className="text-xl font-bold">Page not found</h1>
                <Link to="/" className="mt-4 inline-block font-medium text-amber-700 hover:underline">
                  Back to recipes
                </Link>
              </div>
            }
          />
        </Routes>
      </div>
    </AuthProvider>
  );
}
