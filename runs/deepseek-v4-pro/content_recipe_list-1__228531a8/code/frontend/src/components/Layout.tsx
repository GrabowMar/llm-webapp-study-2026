import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { username, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      <header className="bg-amber-600 text-white shadow">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-xl font-bold tracking-tight">
            Recipe Book
          </Link>
          <div className="flex items-center gap-3">
            {username ? (
              <>
                <span className="text-sm text-amber-100">
                  Signed in as <strong className="text-white">{username}</strong>
                </span>
                <Link
                  to="/recipes/new"
                  className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50"
                >
                  Add recipe
                </Link>
                <button
                  onClick={() => {
                    signOut();
                    navigate("/");
                  }}
                  className="rounded-md border border-amber-300 px-3 py-1.5 text-sm font-medium hover:bg-amber-500"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-md px-3 py-1.5 text-sm font-medium hover:bg-amber-500"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50"
                >
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
