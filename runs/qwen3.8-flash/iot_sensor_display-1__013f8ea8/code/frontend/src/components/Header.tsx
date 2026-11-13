import { Link } from "react-router-dom";
import { useAuth } from "../auth";

export default function Header() {
  const { username, signOut } = useAuth();
  return (
    <header className="border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link to="/" className="text-lg font-semibold text-slate-800">
          <span className="mr-2 inline-block h-3 w-3 rounded-full bg-emerald-500" />
          Sensor Dashboard
        </Link>
        <div className="flex items-center gap-3 text-sm">
          {username ? (
            <>
              <span className="text-slate-500">
                signed in as <strong className="text-slate-800">{username}</strong>
              </span>
              <button
                onClick={signOut}
                className="rounded-md border border-slate-300 px-3 py-1 font-medium text-slate-700 hover:bg-slate-50"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="rounded-md bg-slate-800 px-3 py-1 font-medium text-white hover:bg-slate-700"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
