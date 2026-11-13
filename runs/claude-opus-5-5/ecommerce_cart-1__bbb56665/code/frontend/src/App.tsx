import { useCallback, useEffect, useState } from "react";
import AdminPanel from "./AdminPanel";
import AuthForms from "./AuthForms";
import CartPanel from "./CartPanel";
import { api, ApiError, formatPrice, getToken, setToken, type Cart, type Page, type Product, type User } from "./api";

const PAGE_SIZE = 8;
const EMPTY_CART: Cart = { items: [], subtotal: 0 };

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [products, setProducts] = useState<Page<Product> | null>(null);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [cart, setCart] = useState<Cart>(EMPTY_CART);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartError, setCartError] = useState<string | null>(null);
  const [cartBusy, setCartBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const signOutLocal = useCallback(() => {
    setToken(null);
    setUser(null);
    setCart(EMPTY_CART);
    setCartOpen(false);
  }, []);

  const handleError = useCallback(
    (err: unknown, fallback: string): string => {
      if (err instanceof ApiError && err.status === 401) {
        signOutLocal();
        return "Your session has expired. Please sign in again.";
      }
      return err instanceof ApiError ? err.message : fallback;
    },
    [signOutLocal],
  );

  useEffect(() => {
    if (!getToken()) {
      setAuthChecked(true);
      return;
    }
    api<User>("/auth/me")
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setAuthChecked(true));
  }, []);

  const loadProducts = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
    if (search) params.set("q", search);
    try {
      const data = await api<Page<Product>>(`/products?${params}`);
      const pages = Math.max(1, Math.ceil(data.total / data.page_size));
      if (page > pages) {
        setPage(pages);
        return;
      }
      setProducts(data);
      setProductsError(null);
    } catch (err) {
      setProductsError(err instanceof ApiError ? err.message : "Failed to load products");
    }
  }, [page, search]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const loadCart = useCallback(async () => {
    if (!user) return;
    try {
      setCart(await api<Cart>("/cart"));
    } catch (err) {
      setCartError(handleError(err, "Failed to load cart"));
    }
  }, [user, handleError]);

  useEffect(() => {
    loadCart();
  }, [loadCart]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  async function addToCart(product: Product) {
    try {
      await api("/cart", { method: "POST", body: { product_id: product.id, quantity: 1 } });
      setToast({ kind: "ok", text: `Added ${product.name} to cart` });
      await loadCart();
    } catch (err) {
      setToast({ kind: "error", text: handleError(err, "Could not add to cart") });
    }
  }

  async function cartMutation(fn: () => Promise<unknown>) {
    setCartError(null);
    setCartBusy(true);
    try {
      await fn();
    } catch (err) {
      setCartError(handleError(err, "Could not update cart"));
    } finally {
      setCartBusy(false);
      await loadCart();
    }
  }

  function setQuantity(itemId: number, quantity: number) {
    if (quantity < 1) {
      cartMutation(() => api(`/cart/${itemId}`, { method: "DELETE" }));
      return;
    }
    cartMutation(() => api(`/cart/${itemId}`, { method: "PATCH", body: { quantity } }));
  }

  function removeItem(itemId: number) {
    cartMutation(() => api(`/cart/${itemId}`, { method: "DELETE" }));
  }

  async function signOut() {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    signOutLocal();
  }

  const itemCount = cart.items.reduce((n, i) => n + i.quantity, 0);
  const pages = products ? Math.max(1, Math.ceil(products.total / products.page_size)) : 1;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <h1 className="text-xl font-bold tracking-tight text-indigo-600">Shop</h1>
          <div className="flex items-center gap-3">
            {user && (
              <>
                <span className="text-sm text-slate-600">
                  Signed in as <strong data-testid="username" className="text-slate-900">{user.username}</strong>
                  {user.is_admin && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">admin</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
                >
                  Sign out
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCartOpen(true);
                    setCartError(null);
                    loadCart();
                  }}
                  aria-label={`Cart (${itemCount} items)`}
                  className="relative rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500"
                >
                  Cart
                  <span
                    data-testid="cart-count"
                    className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-xs font-bold text-indigo-700"
                  >
                    {itemCount}
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
          <section aria-label="Products">
            <form
              className="mb-5 flex gap-2"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                setPage(1);
                setSearch(query.trim());
              }}
            >
              <input
                type="search"
                aria-label="Search products"
                placeholder="Search products…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button type="submit" className="rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
                Search
              </button>
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setSearch("");
                    setPage(1);
                  }}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"
                >
                  Clear
                </button>
              )}
            </form>

            {productsError && (
              <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {productsError}
              </p>
            )}

            {products && products.items.length === 0 ? (
              <p className="py-16 text-center text-slate-500">No products found.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {products?.items.map((p) => (
                  <li
                    key={p.id}
                    data-testid="product-card"
                    className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                  >
                    <div className="relative flex aspect-[4/3] items-center justify-center bg-gradient-to-br from-indigo-100 via-slate-100 to-slate-200">
                      <span className="text-4xl font-bold text-indigo-300" aria-hidden="true">
                        {p.name.charAt(0).toUpperCase()}
                      </span>
                      {p.stock <= 0 && (
                        <span className="absolute left-2 top-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
                          Out of stock
                        </span>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-3">
                      <h3 className="font-semibold text-slate-900">{p.name}</h3>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{p.description}</p>
                      <div className="mt-auto flex items-center justify-between pt-3">
                        <span className="font-bold text-slate-900">{formatPrice(p.price)}</span>
                        {user && (
                          <button
                            type="button"
                            disabled={p.stock <= 0}
                            onClick={() => addToCart(p)}
                            aria-label={`Add ${p.name} to cart`}
                            className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                          >
                            Add to cart
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {products && products.total > 0 && (
              <nav aria-label="Pagination" className="mt-6 flex items-center justify-center gap-3 text-sm">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-100 disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-slate-600">
                  Page {page} of {pages}
                </span>
                <button
                  type="button"
                  disabled={page >= pages}
                  onClick={() => setPage(page + 1)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-100 disabled:opacity-40"
                >
                  Next
                </button>
              </nav>
            )}
          </section>

          <aside>
            {authChecked && !user && <AuthForms onSignedIn={setUser} />}
            {user && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
                <p className="text-slate-600">
                  Welcome, <strong className="text-slate-900">{user.username}</strong>.
                </p>
                <p className="mt-2 text-slate-600">
                  {itemCount} item{itemCount === 1 ? "" : "s"} in your cart · {formatPrice(cart.subtotal)}
                </p>
              </div>
            )}
          </aside>
        </div>

        {user?.is_admin && <AdminPanel onCatalogueChanged={() => { loadProducts(); loadCart(); }} />}
      </main>

      {toast && (
        <div
          role="status"
          className={`fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-md px-4 py-2 text-sm font-medium text-white shadow-lg ${
            toast.kind === "ok" ? "bg-slate-900" : "bg-red-600"
          }`}
        >
          {toast.text}
        </div>
      )}

      {user && cartOpen && (
        <>
          <div className="fixed inset-0 z-20 bg-slate-900/30" onClick={() => setCartOpen(false)} />
          <CartPanel
            cart={cart}
            error={cartError}
            busy={cartBusy}
            onSetQuantity={setQuantity}
            onRemove={removeItem}
            onClose={() => setCartOpen(false)}
          />
        </>
      )}
    </div>
  );
}
