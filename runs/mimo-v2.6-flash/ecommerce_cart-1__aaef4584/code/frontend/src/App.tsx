import { useCallback, useEffect, useState } from "react";
import {
  api,
  clearSession,
  errorMessage,
  getStoredUsername,
  saveSession,
} from "./api";
import AdminPanel from "./components/AdminPanel";
import AuthModal from "./components/AuthModal";
import CartDrawer from "./components/CartDrawer";
import Header from "./components/Header";
import ProductGrid from "./components/ProductGrid";
import type { Cart, CartItem, Product, ProductPage, User } from "./types";

const PAGE_SIZE = 12;

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [cart, setCart] = useState<Cart | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartError, setCartError] = useState("");
  const [cartBusy, setCartBusy] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const [catalogue, setCatalogue] = useState<ProductPage>({
    items: [],
    total: 0,
    page: 1,
    page_size: PAGE_SIZE,
  });
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);

  const refreshCart = useCallback(async () => {
    try {
      setCart(await api<Cart>("/api/cart"));
    } catch (err) {
      if (err instanceof Error && "status" in err && (err as { status: number }).status === 401) {
        clearSession();
        setUser(null);
        setCart(null);
      }
    }
  }, []);

  useEffect(() => {
    const stored = getStoredUsername();
    if (!stored) {
      return;
    }
    let cancelled = false;
    api<{ username: string; is_admin: boolean }>("/api/auth/me")
      .then(async (me) => {
        if (cancelled) {
          return;
        }
        setUser({ username: me.username, isAdmin: me.is_admin });
        await refreshCart();
      })
      .catch(() => {
        if (!cancelled) {
          clearSession();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refreshCart]);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(PAGE_SIZE),
    });
    const q = debouncedQuery;
    if (q) {
      params.set("q", q);
    }
    api<ProductPage>(`/api/products?${params.toString()}`)
      .then((data) => {
        if (!cancelled) {
          setCatalogue(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setNotice(errorMessage(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, page]);

  const cartCount = cart ? cart.items.reduce((sum, item) => sum + item.quantity, 0) : 0;
  const totalPages = Math.max(1, Math.ceil(catalogue.total / catalogue.page_size));

  async function handleAuth(
    username: string,
    password: string,
    mode: "signin" | "register",
  ) {
    if (mode === "register") {
      await api("/api/auth/register", {
        method: "POST",
        body: { username, password },
      });
    }
    const { token } = await api<{ token: string }>("/api/auth/login", {
      method: "POST",
      body: { username, password },
    });
    saveSession(token, username.trim());
    const me = await api<{ username: string; is_admin: boolean }>("/api/auth/me");
    setUser({ username: me.username, isAdmin: me.is_admin });
    setAuthOpen(false);
    setNotice(mode === "register" ? "Account created — you are signed in." : "Signed in.");
    await refreshCart();
  }

  function handleSignOut() {
    clearSession();
    setUser(null);
    setCart(null);
    setCartOpen(false);
    setCartError("");
    setNotice("Signed out.");
  }

  async function addToCart(product: Product) {
    if (!user) {
      setAuthOpen(true);
      setNotice("Sign in to add items to your cart.");
      return;
    }
    try {
      const updated = await api<Cart>("/api/cart", {
        method: "POST",
        body: { product_id: product.id, quantity: 1 },
      });
      setCart(updated);
      setCartError("");
      setCartOpen(true);
    } catch (err) {
      setNotice(errorMessage(err));
    }
  }

  async function changeQuantity(item: CartItem, quantity: number) {
    if (quantity < 1) {
      return;
    }
    setCartBusy(true);
    setCartError("");
    try {
      setCart(
        await api<Cart>(`/api/cart/${item.id}`, {
          method: "PATCH",
          body: { quantity },
        }),
      );
    } catch (err) {
      setCartError(errorMessage(err));
    } finally {
      setCartBusy(false);
    }
  }

  async function removeItem(item: CartItem) {
    setCartBusy(true);
    setCartError("");
    try {
      setCart(await api<Cart>(`/api/cart/${item.id}`, { method: "DELETE" }));
    } catch (err) {
      setCartError(errorMessage(err));
    } finally {
      setCartBusy(false);
    }
  }

  async function createProduct(body: {
    name: string;
    description: string;
    price: number;
    stock: number;
    is_active: boolean;
  }) {
    return api<Product>("/api/admin/products", { method: "POST", body });
  }

  async function refreshProducts() {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(PAGE_SIZE),
    });
    if (debouncedQuery) {
      params.set("q", debouncedQuery);
    }
    setCatalogue(await api<ProductPage>(`/api/products?${params.toString()}`));
  }

  async function patchProduct(id: number, body: Partial<Product>) {
    const updated = await api<Product>(`/api/admin/products/${id}`, {
      method: "PATCH",
      body,
    });
    setCatalogue((current) => ({
      ...current,
      items: updated.is_active
        ? current.items.map((item) => (item.id === id ? updated : item))
        : current.items.filter((item) => item.id !== id),
    }));
    return updated;
  }

  const isAdmin = user?.isAdmin ?? false;

  return (
    <div className="min-h-screen text-slate-800">
      <Header
        user={user}
        cartCount={cartCount}
        cartOpen={cartOpen}
        onCartClick={() => {
          setCartOpen(true);
          setCartError("");
        }}
        onAuthClick={() => setAuthOpen(true)}
        onSignOut={handleSignOut}
      />

      <main className="mx-auto max-w-6xl px-4 py-6">
        {notice && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm text-indigo-800">
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice("")}
              aria-label="Dismiss"
              className="ml-3 text-indigo-400 hover:text-indigo-700"
            >
              ✕
            </button>
          </div>
        )}

        {isAdmin && (
          <AdminPanel onCreated={refreshProducts} onCreate={createProduct} />
        )}

        <section>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-2xl font-bold text-slate-900">Products</h1>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search products…"
              aria-label="Search products"
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 sm:w-72"
            />
          </div>

          <ProductGrid
            products={catalogue.items}
            isAdmin={isAdmin}
            onAdd={addToCart}
            onPatch={patchProduct}
          />

          <nav className="mt-6 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-sm text-slate-600">
              Page {catalogue.page} of {totalPages} · {catalogue.total} product
              {catalogue.total === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
            >
              Next
            </button>
          </nav>
        </section>
      </main>

      <CartDrawer
        open={cartOpen}
        cart={cart}
        error={cartError}
        busy={cartBusy}
        onClose={() => setCartOpen(false)}
        onQuantity={changeQuantity}
        onRemove={removeItem}
      />

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuth={handleAuth}
      />

      <footer className="mx-auto max-w-6xl px-4 py-8 text-center text-xs text-slate-400">
        Cart totals are computed server-side from current catalogue prices.
      </footer>
    </div>
  );
}
