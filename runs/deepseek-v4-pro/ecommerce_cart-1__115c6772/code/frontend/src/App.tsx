import { useCallback, useEffect, useState } from "react";
import {
  api,
  ApiError,
  Cart,
  CartItem,
  Product,
  ProductsPage,
  getToken,
  setToken,
  getUsername,
  setUsername,
} from "./api";

const PAGE_SIZE = 8;

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export default function App() {
  const [user, setUser] = useState<string | null>(() => {
    if (getToken() && getUsername()) return getUsername();
    return null;
  });
  const [isAdmin, setIsAdmin] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [cart, setCart] = useState<Cart | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartError, setCartError] = useState<string | null>(null);
  const [adminView, setAdminView] = useState(false);

  const refreshCart = useCallback(async () => {
    if (!getToken()) {
      setCart(null);
      return;
    }
    try {
      const c = await api.cart();
      setCart(c);
    } catch {
      setCart(null);
    }
  }, []);

  useEffect(() => {
    refreshCart();
  }, [refreshCart, user]);

  const handleLogin = (username: string, token: string, admin: boolean) => {
    setToken(token);
    setUsername(username);
    setUser(username);
    setIsAdmin(admin);
    setAuthOpen(false);
    refreshCart();
  };

  const handleLogout = () => {
    setToken(null);
    setUsername(null);
    setUser(null);
    setIsAdmin(false);
    setCart(null);
    setAdminView(false);
  };

  const cartCount = cart
    ? cart.items.reduce((sum, i) => sum + i.quantity, 0)
    : 0;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <button
            className="text-xl font-bold tracking-tight"
            onClick={() => setAdminView(false)}
          >
            Shop
          </button>

          <div className="flex items-center gap-2">
            {user && isAdmin && (
              <button
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  adminView
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 hover:bg-gray-200"
                }`}
                onClick={() => setAdminView((v) => !v)}
              >
                Admin
              </button>
            )}

            {user ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">
                  Signed in as <span className="font-medium">{user}</span>
                </span>
                <button
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                  onClick={handleLogout}
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
                onClick={() => setAuthOpen(true)}
              >
                Sign in
              </button>
            )}

            <button
              className="relative rounded-lg bg-gray-100 p-2 hover:bg-gray-200"
              onClick={() => setCartOpen(true)}
              aria-label="Open cart"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.3 3.5a1 1 0 00.8 1.5h11"
                />
                <circle cx="9" cy="20" r="1" />
                <circle cx="17" cy="20" r="1" />
              </svg>
              {cartCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {adminView ? (
          <AdminPanel />
        ) : (
          <ProductGrid onCartChanged={refreshCart} />
        )}
      </main>

      {authOpen && (
        <AuthModal
          onClose={() => setAuthOpen(false)}
          onLogin={handleLogin}
        />
      )}

      {cartOpen && (
        <CartPanel
          cart={cart}
          error={cartError}
          onClose={() => {
            setCartOpen(false);
            setCartError(null);
          }}
          onChanged={() => {
            refreshCart();
          }}
          onError={(m) => setCartError(m)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

function AuthModal({
  onClose,
  onLogin,
}: {
  onClose: () => void;
  onLogin: (username: string, token: string, admin: boolean) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsernameState] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "register") {
        await api.register(username, password);
        const { token } = await api.login(username, password);
        onLogin(username, token, false);
      } else {
        const { token } = await api.login(username, password);
        onLogin(username, token, username === "admin");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex justify-between">
          <h2 className="text-lg font-semibold">
            {mode === "login" ? "Sign in" : "Create account"}
          </h2>
          <button
            className="text-gray-400 hover:text-gray-600"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="mb-4 flex rounded-lg bg-gray-100 p-1">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium ${
                mode === m ? "bg-white shadow" : "text-gray-500"
              }`}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
            >
              {m === "login" ? "Sign in" : "Register"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsernameState(e.target.value)}
            autoFocus
          />
          <input
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-gray-900 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Register"}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Product grid                                                        */
/* ------------------------------------------------------------------ */

function ProductGrid({ onCartChanged }: { onCartChanged: () => void }) {
  const [q, setQ] = useState("");
  const [input, setInput] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ProductsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .products(q, page, PAGE_SIZE)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q, page]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  async function addToCart(product: Product) {
    setMessage(null);
    try {
      await api.addToCart(product.id, 1);
      onCartChanged();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not add item");
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <form
          className="flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(input.trim());
            setPage(1);
          }}
        >
          <input
            className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="Search products…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </form>
        <span className="text-sm text-gray-500">
          {data ? `${data.total} product${data.total === 1 ? "" : "s"}` : ""}
        </span>
      </div>

      {message && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {message}
        </p>
      )}

      {loading ? (
        <p className="py-12 text-center text-gray-400">Loading…</p>
      ) : data && data.items.length === 0 ? (
        <p className="py-12 text-center text-gray-400">No products found.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {data?.items.map((p) => (
            <div
              key={p.id}
              className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white"
            >
              <div className="relative flex aspect-square items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 text-4xl text-gray-400">
                🛍️
                {p.stock === 0 && (
                  <span className="absolute right-2 top-2 rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">
                    Out of stock
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col p-3">
                <h3 className="font-medium leading-snug">{p.name}</h3>
                <p className="mb-2 text-sm text-gray-500">{money(p.price)}</p>
                <button
                  className="mt-auto rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                  disabled={p.stock === 0}
                  onClick={() => addToCart(p)}
                >
                  Add to cart
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Prev
          </button>
          <span className="text-sm text-gray-600">
            Page {page} of {totalPages}
          </span>
          <button
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cart panel                                                          */
/* ------------------------------------------------------------------ */

function CartPanel({
  cart,
  error,
  onClose,
  onChanged,
  onError,
}: {
  cart: Cart | null;
  error: string | null;
  onClose: () => void;
  onChanged: () => void;
  onError: (m: string | null) => void;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);

  async function setQuantity(item: CartItem, quantity: number) {
    setBusyId(item.id);
    onError(null);
    try {
      await api.updateCartItem(item.id, quantity);
      onChanged();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Could not update item");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(item: CartItem) {
    setBusyId(item.id);
    onError(null);
    try {
      await api.removeCartItem(item.id);
      onChanged();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Could not remove item");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/40">
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-lg font-semibold">Your cart</h2>
          <button
            className="text-gray-400 hover:text-gray-600"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {!cart || cart.items.length === 0 ? (
            <p className="py-8 text-center text-gray-400">Your cart is empty.</p>
          ) : (
            <ul className="space-y-3">
              {cart.items.map((item) => (
                <li
                  key={item.id}
                  className="rounded-lg border border-gray-200 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-sm text-gray-500">
                        {money(item.unit_price)} each
                      </p>
                    </div>
                    <button
                      className="text-sm text-red-600 hover:underline"
                      onClick={() => remove(item)}
                      disabled={busyId === item.id}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        className="h-7 w-7 rounded-lg border border-gray-300 text-sm font-semibold disabled:opacity-40"
                        disabled={busyId === item.id || item.quantity <= 1}
                        onClick={() => setQuantity(item, item.quantity - 1)}
                      >
                        −
                      </button>
                      <span className="w-8 text-center text-sm">
                        {item.quantity}
                      </span>
                      <button
                        className="h-7 w-7 rounded-lg border border-gray-300 text-sm font-semibold disabled:opacity-40"
                        disabled={busyId === item.id}
                        onClick={() => setQuantity(item, item.quantity + 1)}
                      >
                        +
                      </button>
                    </div>
                    <span className="font-medium">
                      {money(item.line_total)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-gray-200 px-4 py-3">
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
          <div className="flex items-center justify-between text-lg font-semibold">
            <span>Subtotal</span>
            <span>{money(cart?.subtotal ?? 0)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Admin panel                                                         */
/* ------------------------------------------------------------------ */

function AdminPanel() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.products("", 1, 100);
      setProducts(res.items);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Admin</h2>

      <AdminCreateForm
        onCreated={(m) => {
          setMessage(m);
          load();
        }}
      />

      {message && (
        <p className="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700">
          {message}
        </p>
      )}

      {loading ? (
        <p className="py-8 text-center text-gray-400">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Price</th>
                <th className="px-3 py-2 font-medium">Stock</th>
                <th className="px-3 py-2 font-medium">Active</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <AdminRow
                  key={p.id}
                  product={p}
                  onError={(m) => setMessage(m)}
                  onSaved={() => load()}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AdminCreateForm({ onCreated }: { onCreated: (m: string) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("0");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.adminCreateProduct({
        name,
        description,
        price: Number(price),
        stock: Number(stock),
      });
      setName("");
      setDescription("");
      setPrice("");
      setStock("0");
      onCreated("Product created.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create product");
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-gray-200 bg-white p-4"
    >
      <h3 className="mb-3 font-medium">Add product</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <input
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          placeholder="Price"
          type="number"
          step="0.01"
          min="0"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <input
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          placeholder="Stock"
          type="number"
          min="0"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        className="mt-3 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
      >
        Add product
      </button>
    </form>
  );
}

function AdminRow({
  product,
  onError,
  onSaved,
}: {
  product: Product;
  onError: (m: string) => void;
  onSaved: () => void;
}) {
  const [price, setPrice] = useState(String(product.price));
  const [stock, setStock] = useState(String(product.stock));
  const [active, setActive] = useState(product.is_active);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPrice(String(product.price));
    setStock(String(product.stock));
    setActive(product.is_active);
  }, [product]);

  async function save(fields: Partial<{
    name: string;
    description: string;
    price: number;
    stock: number;
    is_active: boolean;
  }>) {
    setSaving(true);
    try {
      await api.adminUpdateProduct(product.id, fields);
      onSaved();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Could not update product");
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="px-3 py-2">
        <div className="font-medium">{product.name}</div>
        {product.description && (
          <div className="text-xs text-gray-500">{product.description}</div>
        )}
      </td>
      <td className="px-3 py-2">
        <input
          className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm"
          type="number"
          step="0.01"
          min="0"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onBlur={() => {
            const v = Number(price);
            if (v !== product.price) save({ price: v });
          }}
        />
      </td>
      <td className="px-3 py-2">
        <input
          className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm"
          type="number"
          min="0"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          onBlur={() => {
            const v = Number(stock);
            if (v !== product.stock) save({ stock: Math.floor(v) });
          }}
        />
      </td>
      <td className="px-3 py-2">
        <button
          disabled={saving}
          onClick={() => save({ is_active: !active })}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            active
              ? "bg-green-100 text-green-700"
              : "bg-gray-200 text-gray-500"
          }`}
        >
          {active ? "Active" : "Inactive"}
        </button>
      </td>
    </tr>
  );
}
