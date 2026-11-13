import { BrowserRouter, Link, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import RecipeDetail from "./pages/RecipeDetail";
import RecipeForm from "./pages/RecipeForm";
import RecipeList from "./pages/RecipeList";
import Register from "./pages/Register";
import SignIn from "./pages/SignIn";

function Header() {
  const { signedIn, username, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link to="/" className="text-xl font-bold tracking-tight text-emerald-700">
          Recipe Book
        </Link>
        <nav className="ml-auto flex flex-wrap items-center gap-2">
          {signedIn ? (
            <>
              <NavLink
                to="/recipes/new"
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Add recipe
              </NavLink>
              <span className="text-sm text-stone-600">
                Signed in as{" "}
                <span className="font-semibold text-stone-900">{username}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  signOut();
                  navigate("/");
                }}
                className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <NavLink
                to="/signin"
                className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
              >
                Sign in
              </NavLink>
              <NavLink
                to="/register"
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Register
              </NavLink>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function NotFound() {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-10 text-center">
      <h1 className="text-2xl font-bold text-stone-800">Page not found</h1>
      <p className="mt-2 text-stone-600">The page you are looking for does not exist.</p>
      <Link
        to="/"
        className="mt-4 inline-block rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
      >
        Back to recipes
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="flex min-h-screen flex-col bg-amber-50 text-stone-800">
          <Header />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
            <Routes>
              <Route path="/" element={<RecipeList />} />
              <Route path="/recipes/new" element={<RecipeForm />} />
              <Route path="/recipes/:id" element={<RecipeDetail />} />
              <Route path="/recipes/:id/edit" element={<RecipeForm />} />
              <Route path="/signin" element={<SignIn />} />
              <Route path="/register" element={<Register />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
          <footer className="border-t border-stone-200 bg-white py-4 text-center text-sm text-stone-500">
            Recipe Book &middot; browse, cook, share
          </footer>
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}
