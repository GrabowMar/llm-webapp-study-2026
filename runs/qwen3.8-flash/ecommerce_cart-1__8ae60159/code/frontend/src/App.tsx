import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import AdminPanel from "./components/AdminPanel";
import AuthForm from "./components/AuthForm";
import CartPanel from "./components/CartPanel";
import ProductGrid from "./components/ProductGrid";
import type { Auth, Cart, Product } from "./types";

const STORAGE_KEY = "shop.auth";

function loadStoredAuth(): Auth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Auth;
  } catch {
    return null;
  }
}

const EMPTY_CART: Cart = { items: [], subtotal: 0 };

export default function App() {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [checking, setChecking] = useState(true);
  const [cart, setCart] = useState<Cart>(EMPTY_CART);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartError, setCartError] = useState<string | null>(null);
  const [cartBusy, setCartBusy] = useState(false);
  const [adminTab, setAdminTab] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const stored = loadStoredAuth();
    if (!stored) {
      setChecking(false);
      return;
    }
    api
      .me(stored.token)
      .then((me) => setAuth({ ...stored, username: me.username, isAdmin: me.is_admin }))
      .catch(() => localStorage.removeItem(STORAGE_KEY))
      .finally(() => setChecking(false));
  }, []);

  const refreshCart = useCallback((token: string) => {
    api.getCart(token).then(setCart).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (auth) refreshCart(auth.token);
    else setCart(EMPTY_CART);
  }, [auth, refreshCart]);

  function signIn(next: Auth) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setAuth(next);
    setCartError(null);
  }

  async function signOut() {
    if (auth) {
      try {
        await api.logout(auth.token);
      } catch {
        // ignore network issues on logout
      }
      localStorage.removeItem(STORAGE_KEY);
    }
    setAuth(null);
    setAdminTab(false);
    setCartOpen(false);
  }

  async function addToCart(product: Product) {
    if (!auth) return;
    setCartError(null);
    try {
      setCart(await api.addToCart(auth.token, product.id, 1));
      setToast(`Added “${product.name}” to cart`);
      setTimeout(() => setToast(null), 2500);
    } catch (err) {
      setCartError(err instanceof Error ? err.message : "Could not add to cart");
      setCartOpen(true);
    }
  }

  async function mutate(action: (token: string) => Promise<Cart>) {
    if (!auth) return;
    setCartBusy(true);
    setCartError(null);
    try {
      setCart(await action(auth.token));
    } catch (err) {
      setCartError(err instanceof Error ? err.message : "Cart update failed");
    } finally {
      setCartBusy(false);
    }
  }

  const cartCount = cart.items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <span className="text-xl font-bold tracking-tight text-indigo-700">⚓ Harbor Shop</span>

          {auth && (
            <nav className="ml-2 flex items-center gap-1 text-sm">
              <button
                type="button"
                onClick={() => setAdminTab(false)}
                className={`rounded-lg px-3 py-1.5 font-medium ${
                  !adminTab ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Shop
              </button>
              {auth.isAdmin && (
                <button
                  type="button"
                  onClick={() => setAdminTab(true)}
                  className={`rounded-lg px-3 py-1.5 font-medium ${
                    adminTab ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  Admin
                </button>
              )}
            </nav>
          )}

          <div className="ml-auto flex items-center gap-3">
            {auth ? (
              <>
                <span className="hidden text-sm text-slate-600 sm:inline">
                  Signed in as <strong>{auth.username}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setCartOpen(true)}
                  className="relative rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Cart
                  {cartCount > 0 && (
                    <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1 text-xs font-bold text-white">
                      {cartCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  Sign out
                </button>
              </>
            ) : (
              <span className="text-sm text-slate-500">Guest</span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {checking ? (
          <p className="mt-16 text-center text-sm text-slate-500">Loading…</p>
        ) : adminTab && auth?.isAdmin ? (
          <AdminPanel token={auth.token} />
        ) : (
          <div className="space-y-8">
            <ProductGrid canBuy={!!auth} onAdd={addToCart} />
            {!auth && (
              <div>
                <h2 className="mb-3 text-center text-sm font-medium uppercase tracking-wide text-slate-500">
                  Sign in to keep your own cart
                </h2>
                <AuthForm onAuth={signIn} />
              </div>
            )}
          </div>
        )}
      </main>

      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      {cartOpen && auth && (
        <CartPanel
          cart={cart}
          error={cartError}
          busy={cartBusy}
          onClose={() => {
            setCartOpen(false);
            setCartError(null);
          }}
          onSetQuantity={(itemId, quantity) =>
            mutate((token) => api.setCartQuantity(token, itemId, quantity))
          }
          onRemove={(itemId) => mutate((token) => api.removeCartItem(token, itemId))}
        />
      )}
    </div>
  );
}
