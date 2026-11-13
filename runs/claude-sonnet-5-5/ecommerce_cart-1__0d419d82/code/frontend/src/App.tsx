import { useCallback, useEffect, useState } from "react";
import {
  api,
  ApiError,
  loadSession,
  saveSession,
  setUnauthorizedHandler,
  type Cart,
  type Session,
} from "./api";
import AuthForms from "./AuthForms";
import CartPanel from "./CartPanel";
import ProductGrid from "./ProductGrid";
import AdminPanel from "./AdminPanel";

const btn =
  "rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50";

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [cart, setCart] = useState<Cart>({ items: [], subtotal: 0 });
  const [cartOpen, setCartOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [view, setView] = useState<"shop" | "admin">("shop");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);

  const updateSession = useCallback((s: Session | null) => {
    saveSession(s);
    setSession(s);
    if (!s) {
      setCart({ items: [], subtotal: 0 });
      setCartOpen(false);
      setView("shop");
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => updateSession(null));
  }, [updateSession]);

  const refreshCart = useCallback(async () => {
    if (!loadSession()) return;
    try {
      setCart(await api<Cart>("GET", "/cart"));
    } catch {
      /* handled by 401 handler */
    }
  }, []);

  useEffect(() => {
    if (session) void refreshCart();
  }, [session, refreshCart]);

  const signOut = async () => {
    try {
      await api("POST", "/auth/logout");
    } catch {
      /* ignore */
    }
    updateSession(null);
  };

  const addToCart = async (productId: number) => {
    if (!session) {
      setAuthOpen(true);
      setNotice("Sign in to add items to your cart.");
      return;
    }
    try {
      await api("POST", "/cart", { product_id: productId, quantity: 1 });
      setNotice("");
      await refreshCart();
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Something went wrong");
    }
  };

  const count = cart.items.reduce((n, i) => n + i.quantity, 0);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <button
            className="text-xl font-bold"
            onClick={() => setView("shop")}
          >
            Shop
          </button>
          {session?.is_admin && (
            <button
              className={`rounded px-2 py-1 text-sm ${view === "admin" ? "bg-slate-200" : "hover:bg-slate-100"}`}
              onClick={() => setView(view === "admin" ? "shop" : "admin")}
            >
              Admin
            </button>
          )}
          <div className="ml-auto flex items-center gap-3">
            {session ? (
              <>
                <span className="text-sm" data-testid="username">
                  {session.username}
                </span>
                <button className={btn} onClick={signOut}>
                  Sign out
                </button>
              </>
            ) : (
              <button className={btn} onClick={() => setAuthOpen((o) => !o)}>
                Sign in
              </button>
            )}
            <button
              className="relative rounded border px-3 py-1.5 text-sm font-medium hover:bg-slate-100"
              onClick={() => {
                if (session) setCartOpen((o) => !o);
                else {
                  setAuthOpen(true);
                  setNotice("Sign in to see your cart.");
                }
              }}
              aria-label="Cart"
            >
              Cart
              <span
                data-testid="cart-badge"
                className="ml-2 inline-block min-w-5 rounded-full bg-amber-500 px-1.5 text-center text-xs font-bold text-white"
              >
                {count}
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {notice && (
          <p role="alert" className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
            {notice}
          </p>
        )}
        {!session && authOpen && (
          <AuthForms
            onSession={(s) => {
              updateSession(s);
              setAuthOpen(false);
              setNotice("");
            }}
          />
        )}
        {view === "admin" && session?.is_admin ? (
          <AdminPanel onChanged={() => { setReload((n) => n + 1); void refreshCart(); }} />
        ) : (
          <ProductGrid reload={reload} onAdd={addToCart} />
        )}
      </main>

      {cartOpen && session && (
        <CartPanel
          cart={cart}
          onClose={() => setCartOpen(false)}
          onChanged={refreshCart}
        />
      )}
    </div>
  );
}

