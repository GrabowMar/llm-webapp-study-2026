import { useCallback, useEffect, useState } from "react";
import AdminPanel from "./components/AdminPanel";
import AuthForms from "./components/AuthForms";
import CartPanel from "./components/CartPanel";
import ProductGrid from "./components/ProductGrid";
import type { Cart } from "./lib/api";
import {
  ApiError,
  api,
  clearSession,
  errorMessage,
  getStoredUsername,
  getToken,
} from "./lib/api";

export default function App() {
  const [user, setUser] = useState<string | null>(() =>
    getToken() ? getStoredUsername() : null,
  );
  const [cart, setCart] = useState<Cart | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register" | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [tab, setTab] = useState<"shop" | "admin">("shop");
  const [notice, setNotice] = useState<string | null>(null);

  const signedIn = user !== null;
  const isAdmin = user === "admin";

  const signOut = useCallback(() => {
    clearSession();
    setUser(null);
    setCart(null);
    setCartOpen(false);
    setTab("shop");
    setNotice(null);
  }, []);

  const refreshCart = useCallback(async () => {
    if (!getToken()) {
      setCart(null);
      return;
    }
    try {
      setCart(await api<Cart>("/cart"));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        signOut();
        setNotice("Your session has expired. Please sign in again.");
      } else {
        setNotice(errorMessage(err));
      }
    }
  }, [signOut]);

  useEffect(() => {
    refreshCart();
  }, [user, refreshCart]);

  const itemCount = cart ? cart.items.reduce((sum, item) => sum + item.quantity, 0) : 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <button
            onClick={() => setTab("shop")}
            className="flex items-center gap-2 text-left"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M6 4a1 1 0 0 0-1 1v1H3.5A1.5 1.5 0 0 0 2 7.5v8A2.5 2.5 0 0 0 4.5 18h11a2.5 2.5 0 0 0 2.5-2.5v-8A1.5 1.5 0 0 0 16.5 6H15V5a1 1 0 1 0-2 0v1H7V5a1 1 0 0 0-1-1Zm3 3h6.5l.5 1v7.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V8l.5-1H9Z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
            <span>
              <span className="block text-lg font-bold leading-tight">Shop</span>
              <span className="block text-xs text-slate-500">Everyday essentials</span>
            </span>
          </button>

          <div className="flex items-center gap-2 sm:gap-3">
            {signedIn ? (
              <>
                <span className="text-sm text-slate-600">
                  Signed in as <span className="font-semibold">{user}</span>
                </span>
                <button
                  onClick={signOut}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setAuthMode("login")}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Sign in
                </button>
                <button
                  onClick={() => setAuthMode("register")}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500"
                >
                  Register
                </button>
              </>
            )}
            <button
              onClick={() => {
                if (signedIn) setCartOpen(true);
                else setAuthMode("login");
              }}
              className="relative rounded-lg border border-slate-300 p-2 text-slate-700 hover:bg-slate-50"
              aria-label={`Cart, ${itemCount} items`}
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M3 3a1 1 0 0 0-1 1v1h1.5l1.6 8.3A2 2 0 0 0 7.07 15h6.76a2 2 0 0 0 1.95-1.55L17.5 6H6.2l-.3-1.5A1 1 0 0 0 5 3.5H3Zm12 13a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm-8 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
              </svg>
              {itemCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-xs font-bold text-white">
                  {itemCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-6xl gap-1 px-4 pb-2">
          <button
            onClick={() => setTab("shop")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === "shop"
                ? "bg-indigo-50 text-indigo-700"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Products
          </button>
          {isAdmin && (
            <button
              onClick={() => setTab("admin")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === "admin"
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Admin
            </button>
          )}
        </nav>
      </header>

      {notice && (
        <div className="mx-auto mt-4 max-w-6xl px-4">
          <div className="flex items-center justify-between rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span>{notice}</span>
            <button onClick={() => setNotice(null)} className="font-semibold">
              Dismiss
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-8">
        {tab === "admin" && isAdmin ? (
          <AdminPanel />
        ) : (
          <ProductGrid
            signedIn={signedIn}
            onRequireAuth={() => setAuthMode("login")}
            onCartUpdated={refreshCart}
          />
        )}
      </main>

      {authMode && (
        <AuthForms
          initialMode={authMode}
          onClose={() => setAuthMode(null)}
          onSignedIn={(username) => {
            setUser(username);
            setAuthMode(null);
            setNotice(null);
            refreshCart();
          }}
        />
      )}

      <CartPanel
        open={cartOpen}
        cart={cart}
        onClose={() => setCartOpen(false)}
        onChanged={refreshCart}
      />
    </div>
  );
}
