import Link from "../router";

interface Props {
  user: string | null;
  onSignOut: () => void;
}

export default function Header({ user, onSignOut }: Props) {
  return (
    <header className="bg-slate-900 text-white shadow">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link to="/" className="text-lg font-semibold tracking-tight hover:text-sky-300">
          Warehouse Inventory
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <Link to="/" className="text-slate-200 hover:text-white">
            Inventory
          </Link>
          {user ? (
            <>
              <span
                className="max-w-40 truncate rounded-full bg-slate-700 px-3 py-1 font-medium"
                title={user}
              >
                {user}
              </span>
              <button
                type="button"
                onClick={onSignOut}
                className="rounded bg-sky-600 px-3 py-1.5 font-medium hover:bg-sky-500"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="rounded border border-slate-600 px-3 py-1.5 text-slate-200 hover:border-slate-400 hover:text-white"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                className="rounded bg-sky-600 px-3 py-1.5 font-medium hover:bg-sky-500"
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
