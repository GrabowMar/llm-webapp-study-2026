import { useAuth } from "../auth";

export function TagPill({
  tag,
  onClick,
  active,
}: {
  tag: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const base =
    "inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium " +
    (active
      ? "border-emerald-600 bg-emerald-600 text-white"
      : "border-emerald-200 bg-emerald-50 text-emerald-700");
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${base} hover:bg-emerald-100`}>
        #{tag}
      </button>
    );
  }
  return <span className={base}>#{tag}</span>;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  if (!message) return null;
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <span>{message}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="text-red-400 hover:text-red-600">
          ✕
        </button>
      )}
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200";

export { inputClass };

export function Header({ onNavigate }: { onNavigate: (to: string) => void }) {
  const { user, signOut } = useAuth();
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
        <button
          type="button"
          onClick={() => onNavigate("/")}
          className="text-lg font-bold tracking-tight text-slate-900"
        >
          Multi<span className="text-emerald-600">Blog</span>
        </button>
        <nav className="flex items-center gap-2 text-sm">
          {user ? (
            <>
              <button
                type="button"
                onClick={() => onNavigate("/new")}
                className="rounded-md bg-emerald-600 px-3 py-1.5 font-medium text-white shadow-sm hover:bg-emerald-700"
              >
                New post
              </button>
              <span className="hidden font-medium text-slate-500 sm:inline">
                {user.username}
                {user.is_admin && (
                  <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700">
                    admin
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => {
                  signOut();
                  onNavigate("/");
                }}
                className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-50"
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate("/login")}
              className="rounded-md bg-emerald-600 px-3 py-1.5 font-medium text-white shadow-sm hover:bg-emerald-700"
            >
              Sign in
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
