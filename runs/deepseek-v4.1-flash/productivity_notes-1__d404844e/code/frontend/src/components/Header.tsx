import { useAuth } from "../auth";
import { navigate } from "../router";

export default function Header() {
  const { username, logout } = useAuth();

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-lg font-bold text-slate-900"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-black text-white">
            TN
          </span>
          Tagged Notes
        </button>

        <div className="flex items-center gap-3">
          {username ? (
            <>
              <button
                onClick={() => navigate("/notes/new")}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                New note
              </button>
              <span className="hidden text-sm text-slate-600 sm:inline">
                Signed in as <span className="font-semibold text-slate-900">{username}</span>
              </span>
              <button
                onClick={() => {
                  logout();
                  navigate("/");
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => navigate("/login")}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Sign in
              </button>
              <button
                onClick={() => navigate("/register")}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Register
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
