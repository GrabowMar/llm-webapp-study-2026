import { useAuth } from "../auth";

export default function Header() {
  const { username, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <a
          href="#/"
          className="flex items-center gap-2 text-lg font-bold tracking-tight text-amber-700 hover:text-amber-800"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-600 text-sm font-bold text-white">
            RB
          </span>
          Recipe Book
        </a>

        <div className="flex items-center gap-2">
          {username ? (
            <>
              <a
                href="#/add"
                className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-amber-700"
              >
                Add recipe
              </a>
              <span className="hidden text-sm text-slate-600 sm:inline">
                Signed in as{" "}
                <span className="font-semibold text-slate-800">{username}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  signOut();
                  window.location.hash = "#/";
                }}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <a
                href="#/login"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Sign in
              </a>
              <a
                href="#/register"
                className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-amber-700"
              >
                Register
              </a>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
