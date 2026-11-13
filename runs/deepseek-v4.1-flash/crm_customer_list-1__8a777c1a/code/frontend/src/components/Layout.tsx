import { clearSession } from "../api";
import { Link, useNavigate } from "../router";
import { buttonPrimary } from "../ui";

export default function Layout({
  username,
  onSignedOut,
  children,
}: {
  username: string;
  onSignedOut: () => void;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();

  function signOut() {
    clearSession();
    onSignedOut();
    navigate("/");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-600 text-sm font-bold text-white shadow-sm">
              CD
            </span>
            <span className="text-lg font-semibold text-slate-900">
              Customer Directory
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-600 sm:inline">
              Signed in as <span className="font-medium text-slate-900">{username}</span>
            </span>
            <Link to="/customers/new" className={buttonPrimary}>
              <span aria-hidden="true">+</span> Add customer
            </Link>
            <button
              type="button"
              onClick={signOut}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
