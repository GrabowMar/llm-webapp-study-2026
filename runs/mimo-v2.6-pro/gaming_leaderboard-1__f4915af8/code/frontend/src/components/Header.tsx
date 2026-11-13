interface HeaderProps {
  username: string | null;
  isAdmin: boolean;
  onSignOut: () => void;
}

export default function Header({ username, isAdmin, onSignOut }: HeaderProps) {
  return (
    <header className="bg-gradient-to-r from-indigo-700 via-violet-700 to-fuchsia-700 text-white shadow-lg">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Game Leaderboard</h1>
          <p className="text-sm text-indigo-100">
            Submit scores, chase records, own the board.
          </p>
        </div>
        {username ? (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-sm font-medium">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-300" />
              {username}
              {isAdmin && (
                <span className="rounded-full bg-amber-300 px-2 py-0.5 text-xs font-semibold text-amber-900">
                  admin
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={onSignOut}
              className="cursor-pointer rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium transition hover:bg-white/25"
            >
              Sign out
            </button>
          </div>
        ) : (
          <span className="rounded-full bg-white/10 px-3 py-1.5 text-sm text-indigo-100">
            Not signed in
          </span>
        )}
      </div>
    </header>
  );
}
