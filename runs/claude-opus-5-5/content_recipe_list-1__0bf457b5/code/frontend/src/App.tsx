import { useAuth } from "./auth";
import AuthPage from "./pages/AuthPage";
import RecipeDetail from "./pages/RecipeDetail";
import RecipeForm from "./pages/RecipeForm";
import RecipeList from "./pages/RecipeList";
import { Link, navigate, useLocation } from "./router";
import { primaryButton, secondaryButton } from "./ui";

function Route({ pathname, search }: { pathname: string; search: string }) {
  if (pathname === "/") return <RecipeList search={search} />;
  if (pathname === "/login") return <AuthPage key="login" mode="login" />;
  if (pathname === "/register") return <AuthPage key="register" mode="register" />;
  if (pathname === "/recipes/new") return <RecipeForm key="new" />;
  let m = pathname.match(/^\/recipes\/(\d+)\/edit\/?$/);
  if (m) return <RecipeForm key={`edit-${m[1]}`} id={Number(m[1])} />;
  m = pathname.match(/^\/recipes\/(\d+)\/?$/);
  if (m) return <RecipeDetail id={Number(m[1])} />;
  return (
    <div className="py-16 text-center">
      <h1 className="mb-2 text-2xl font-semibold text-stone-900">Page not found</h1>
      <Link to="/" className="text-amber-700 hover:underline">
        Back to recipes
      </Link>
    </div>
  );
}

export default function App() {
  const { pathname, search } = useLocation();
  const { username, logout } = useAuth();

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link to="/" className="text-xl font-bold text-amber-700">
            Recipe Book
          </Link>
          <nav className="flex flex-wrap items-center gap-3">
            {username ? (
              <>
                <Link to="/recipes/new" className={primaryButton}>
                  Add recipe
                </Link>
                <span className="text-sm text-stone-600">
                  Signed in as <strong className="text-stone-900">{username}</strong>
                </span>
                <button
                  type="button"
                  className={secondaryButton}
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
                <Link to="/login" className={secondaryButton}>
                  Sign in
                </Link>
                <Link to="/register" className={primaryButton}>
                  Register
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Route pathname={pathname} search={search} />
      </main>
    </div>
  );
}
