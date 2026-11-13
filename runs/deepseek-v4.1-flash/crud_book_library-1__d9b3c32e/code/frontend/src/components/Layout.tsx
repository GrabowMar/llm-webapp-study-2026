import { Link, useLocation } from "../router";
import { useAuth } from "../auth";

export function Layout({ children }: { children: React.ReactNode }) {
  const { username, signOut } = useAuth();
  const location = useLocation();
  const isActive = (path: string) =>
    path === "/"
      ? location === "/" || location.startsWith("/?")
      : location.startsWith(path);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden>
              📚
            </span>
            <span className="text-lg font-semibold tracking-tight">
              Book Library
            </span>
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link
              to="/"
              className={`rounded-md px-3 py-1.5 font-medium hover:bg-slate-100 ${
                isActive("/") ? "text-indigo-600" : "text-slate-600"
              }`}
            >
              Books
            </Link>
            {username ? (
              <>
                <Link
                  to="/books/new"
                  className="rounded-md bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-700"
                >
                  Add book
                </Link>
                <span className="hidden text-slate-500 sm:inline">
                  Signed in as{" "}
                  <span className="font-medium text-slate-800">
                    {username}
                  </span>
                </span>
                <button
                  onClick={() => {
                    signOut();
                    window.location.href = "/";
                  }}
                  className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                to="/auth"
                className="rounded-md bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-700"
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
