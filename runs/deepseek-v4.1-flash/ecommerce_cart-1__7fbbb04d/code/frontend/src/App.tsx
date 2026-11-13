import { useCallback, useEffect, useRef, useState } from "react";
import AdminPanel from "./AdminPanel";
import AuthPanel from "./AuthPanel";
import { api, ApiError, getToken, setToken } from "./api";
import CartPanel from "./CartPanel";
import ProductGrid from "./ProductGrid";
import type { Cart, Product, User } from "./types";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [cart, setCart] = useState<Cart | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartError, setCartError] = useState<string | null>(null);
  const [cartBusy, setCartBusy] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [catalogueVersion, setCatalogueVersion] = useState(0);
  const authRef = useRef<HTMLDivElement>(null);

  const loadCart = useCallback(async () => {
    try {
      const result = await api<Cart>("/api/cart");
      setCart(result);
      setCartError(null);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        setToken(null);
        setUser(null);
        setCart(null);
      } else {
        setCartError(caught instanceof ApiError ? caught.message : "Unable to load cart.");
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      if (!getToken()) {
        setChecking(false);
        return;
      }
      try {
        const me = await api<User>("/api/auth/me");
        if (!cancelled) {
          setUser(me);
          await loadCart();
        }
      } catch {
        setToken(null);
      } finally {
        if (!cancelled) {
          setChecking(false);
        }
      }
    }
    restore();
    return () => {
      cancelled = true;
    };
  }, [loadCart]);

  function handleAuthenticated(nextUser: User) {
    setUser(nextUser);
    loadCart();
  }

  async function handleSignOut() {
    setToken(null);
    setUser(null);
    setCart(null);
    setCartOpen(false);
    setAddingId(null);
  }

  async function addToCart(product: Product) {
    setAddingId(product.id);
    setCartError(null);
    try {
      await api("/api/cart", {
        method: "POST",
        body: { product_id: product.id, quantity: 1 },
      });
      await loadCart();
      setCartOpen(true);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        handleSignOut();
      } else {
        setCartError(caught instanceof ApiError ? caught.message : "Unable to add to cart.");
        setCartOpen(true);
      }
    } finally {
      setAddingId(null);
    }
  }

  async function changeQuantity(itemId: number, quantity: number) {
    setCartBusy(true);
    setCartError(null);
    try {
      await api(`/api/cart/${itemId}`, { method: "PATCH", body: { quantity } });
      await loadCart();
    } catch (caught) {
      setCartError(caught instanceof ApiError ? caught.message : "Unable to update quantity.");
    } finally {
      setCartBusy(false);
    }
  }

  async function removeItem(itemId: number) {
    setCartBusy(true);
    setCartError(null);
    try {
      await api(`/api/cart/${itemId}`, { method: "DELETE" });
      await loadCart();
    } catch (caught) {
      setCartError(caught instanceof ApiError ? caught.message : "Unable to remove item.");
    } finally {
      setCartBusy(false);
    }
  }

  function handleCatalogueChange() {
    setCatalogueVersion((value) => value + 1);
    if (user) {
      loadCart();
    }
  }

  const itemCount = cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-teal-600 text-lg font-bold text-white">
              S
            </span>
            <div>
              <p className="text-base font-semibold leading-tight">Studio Market</p>
              <p className="text-xs text-slate-500">Everyday goods, carefully chosen</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {user ? (
              <>
                <span className="hidden text-sm text-slate-600 sm:inline">
                  Signed in as <span className="font-medium text-slate-900">{user.username}</span>
                  {user.is_admin && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                      admin
                    </span>
                  )}
                </span>
                <span className="text-sm font-medium text-slate-900 sm:hidden">{user.username}</span>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => {
                if (user) {
                  setCartOpen(true);
                } else {
                  authRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }
              }}
              className="relative rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Cart
              <span className="ml-2 inline-flex min-w-6 items-center justify-center rounded-full bg-teal-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                {itemCount}
              </span>
            </button>
            {user ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
              >
                Sign out
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  authRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-700"
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        {checking ? (
          <p className="py-20 text-center text-sm text-slate-500">Loading…</p>
        ) : (
          <>
            {!user && (
              <div ref={authRef} className="scroll-mt-24">
                <AuthPanel onAuthenticated={handleAuthenticated} />
              </div>
            )}

            <ProductGrid
              onAdd={addToCart}
              addingId={addingId}
              refreshKey={catalogueVersion}
              signedIn={user !== null}
              onRequireSignIn={() =>
                authRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            />

            {user?.is_admin && <AdminPanel onCatalogueChange={handleCatalogueChange} />}
          </>
        )}
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        Studio Market — a small shop demo.
      </footer>

      <CartPanel
        cart={cart}
        open={cartOpen && user !== null}
        busy={cartBusy}
        error={cartError}
        onClose={() => {
          setCartOpen(false);
          setCartError(null);
        }}
        onChangeQuantity={changeQuantity}
        onRemove={removeItem}
      />
    </div>
  );
}
