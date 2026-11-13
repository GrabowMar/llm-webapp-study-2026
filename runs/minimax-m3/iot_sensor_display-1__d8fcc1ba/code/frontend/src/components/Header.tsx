import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { secondaryButtonClass } from "../ui";

function PulseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5">
      <path d="M3 12h4l3 8 4-16 3 8h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Header() {
  const { username, ready, signOut } = useAuth();

  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
        <Link to="/" className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-accent/15 text-accent">
            <PulseIcon />
          </span>
          <span className="text-lg font-semibold tracking-tight text-slate-100">Sensor Dashboard</span>
        </Link>

        <div className="flex items-center gap-3">
          {username ? (
            <>
              <span className="text-sm text-slate-400">
                Signed in as{" "}
                <span className="font-semibold text-slate-100">{username}</span>
              </span>
              <button type="button" className={secondaryButtonClass} onClick={() => void signOut()}>
                Sign out
              </button>
            </>
          ) : (
            <span className="text-sm text-slate-500">
              {ready ? "Browsing as guest — sign in to manage sensors" : "Checking session…"}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
