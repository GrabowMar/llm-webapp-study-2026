export function BellIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

export function Header({
  username,
  isAdmin,
  unreadCount,
  onSignOut,
}: {
  username: string;
  isAdmin: boolean;
  unreadCount: number;
  onSignOut: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <BellIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">Notification Center</p>
            <p className="text-xs text-slate-500">Your private inbox</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div
            className="relative flex items-center"
            title={`${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`}
          >
            <span className="text-slate-600">
              <BellIcon />
            </span>
            <span
              data-testid="unread-count"
              className={`absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold text-white ${
                unreadCount > 0 ? "bg-rose-500" : "bg-slate-300"
              }`}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
            <span className="sr-only">{unreadCount} unread notifications</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p data-testid="current-user" className="text-sm font-medium text-slate-800">
                {username}
              </p>
              {isAdmin ? <p className="text-xs text-indigo-600">Administrator</p> : null}
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
