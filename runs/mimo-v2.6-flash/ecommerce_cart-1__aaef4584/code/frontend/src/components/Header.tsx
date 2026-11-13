import type { User } from "../types";

type Props = {
  user: User | null;
  cartCount: number;
  cartOpen: boolean;
  onCartClick: () => void;
  onAuthClick: () => void;
  onSignOut: () => void;
};

export default function Header({
  user,
  cartCount,
  cartOpen,
  onCartClick,
  onAuthClick,
  onSignOut,
}: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <a href="/" className="flex items-center gap-2 text-xl font-bold text-slate-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-black text-white">
            S
          </span>
          Shop
        </a>

        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-slate-600 sm:inline">
                Signed in as <span className="font-semibold text-slate-900">{user.username}</span>
              </span>
              <button
                type="button"
                onClick={onSignOut}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onAuthClick}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              Sign in
            </button>
          )}

          <button
            type="button"
            onClick={onCartClick}
            aria-label="Open cart"
            className={`relative rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
              cartOpen
                ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            Cart
            <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1.5 py-0.5 text-xs font-bold text-white">
              {cartCount}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
