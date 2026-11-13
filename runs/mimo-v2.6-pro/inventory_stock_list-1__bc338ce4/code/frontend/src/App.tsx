import { Link } from "react-router-dom";
import { NavLink } from "react-router-dom";
import { Route } from "react-router-dom";
import { Routes } from "react-router-dom";
import { useAuth } from "./auth";
import AuthPage from "./pages/AuthPage";
import ItemFormPage from "./pages/ItemFormPage";
import ItemPage from "./pages/ItemPage";
import ItemsPage from "./pages/ItemsPage";

export default function App() {
  const { username, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-slate-900 text-white shadow">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            Warehouse Inventory
          </Link>
          <nav className="flex flex-wrap items-center gap-3 text-sm">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                isActive ? "font-semibold text-white" : "text-slate-300 hover:text-white"
              }
            >
              Inventory
            </NavLink>
            {username ? (
              <>
                <Link
                  to="/items/new"
                  className="rounded-md bg-sky-600 px-3 py-1.5 font-medium text-white hover:bg-sky-700"
                >
                  Add item
                </Link>
                <span className="text-slate-300">
                  Signed in as <span className="font-semibold text-white">{username}</span>
                </span>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded-md border border-slate-600 px-3 py-1.5 text-slate-200 hover:bg-slate-800"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                to="/account"
                className="rounded-md bg-sky-600 px-3 py-1.5 font-medium text-white hover:bg-sky-700"
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Routes>
          <Route path="/" element={<ItemsPage />} />
          <Route path="/account" element={<AuthPage />} />
          <Route path="/items/new" element={<ItemFormPage />} />
          <Route path="/items/:id" element={<ItemPage />} />
          <Route path="/items/:id/edit" element={<ItemFormPage />} />
          <Route
            path="*"
            element={
              <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-600">
                Page not found.{" "}
                <Link to="/" className="font-medium text-sky-700 hover:underline">
                  Back to inventory
                </Link>
              </div>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
