import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  api,
  getToken,
  money,
  setToken,
  type Cart,
  type Me,
  type Product,
  type ProductPage,
} from "./api";

type AuthMode = "login" | "register";

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong.";
}

function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />;
}

function AuthPanel({
  onSignedIn,
}: {
  onSignedIn: (me: Me) => void;
}) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result =
        mode === "login"
          ? await api.login(username.trim(), password)
          : await api.register(username.trim(), password);
      setToken(result.token);
      onSignedIn({
        id: 0,
        username: result.username,
        is_admin: result.is_admin,
      });
      setPassword("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="mb-6 flex gap-1 rounded-xl bg-slate-100 p-1">
        {(["login", "register"] as AuthMode[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setMode(value);
              setError("");
            }}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              mode === value
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {value === "login" ? "Sign in" : "Register"}
          </button>
        ))}
      </div>
      <h2 className="mb-1 text-xl font-bold text-slate-900">
        {mode === "login" ? "Welcome back" : "Create an account"}
      </h2>
      <p className="mb-6 text-sm text-slate-500">
        {mode === "login"
          ? "Sign in to keep your personal cart."
          : "Register to start adding products to your cart."}
      </p>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Username</span>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Password</span>
          <input
            type="password"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
          />
        </label>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {busy && <Spinner />}
          {mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
      <p className="mt-4 text-center text-xs text-slate-400">
        Browse freely — signing in is only needed for your cart.
      </p>
    </div>
  );
}

function ProductCard({
  product,
  signedIn,
  onAdd,
  busy,
}: {
  product: Product;
  signedIn: boolean;
  onAdd: (product: Product) => void;
  busy: boolean;
}) {
  const soldOut = product.stock <= 0;
  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <div className="relative flex h-40 items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
        <svg
          className="h-14 w-14 text-slate-300"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
        {soldOut && (
          <span className="absolute left-3 top-3 rounded-full bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white shadow">
            Out of stock
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-sm font-semibold text-slate-900">{product.name}</h3>
        <p className="mt-1 line-clamp-2 flex-1 text-xs text-slate-500">
          {product.description || "No description."}
        </p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-lg font-bold text-slate-900">{money(product.price)}</span>
          <button
            type="button"
            disabled={!signedIn || soldOut || busy}
            onClick={() => onAdd(product)}
            title={!signedIn ? "Sign in to add to cart" : undefined}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {soldOut ? "Unavailable" : "Add"}
          </button>
        </div>
        <p className="mt-1 text-right text-[11px] text-slate-400">{product.stock} in stock</p>
      </div>
    </div>
  );
}

function QuantityStepper({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (next: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white">
      <button
        type="button"
        disabled={disabled || value <= 1}
        onClick={() => onChange(value - 1)}
        aria-label="Decrease quantity"
        className="h-8 w-8 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
      >
        −
      </button>
      <span className="w-9 text-center text-sm font-semibold tabular-nums">{value}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(value + 1)}
        aria-label="Increase quantity"
        className="h-8 w-8 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}

function CartPanel({
  cart,
  signedIn,
  onSetQuantity,
  onRemove,
  busyItem,
  error,
  onClearError,
}: {
  cart: Cart;
  signedIn: boolean;
  onSetQuantity: (itemId: number, quantity: number) => void;
  onRemove: (itemId: number) => void;
  busyItem: number | null;
  error: string;
  onClearError: () => void;
}) {
  return (
    <aside className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 className="text-base font-bold text-slate-900">Your cart</h2>
        <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
          {cart.items.reduce((sum, item) => sum + item.quantity, 0)} items
        </span>
      </div>
      {!signedIn ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">
          Sign in to see and manage your cart.
        </p>
      ) : cart.items.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">Your cart is empty.</p>
      ) : (
        <>
          <ul className="divide-y divide-slate-100">
            {cart.items.map((item) => (
              <li key={item.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{item.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{money(item.unit_price)} each</p>
                  </div>
                  <p className="shrink-0 text-sm font-bold text-slate-900">
                    {money(item.line_total)}
                  </p>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <QuantityStepper
                    value={item.quantity}
                    onChange={(next) => onSetQuantity(item.id, next)}
                    disabled={busyItem === item.id}
                  />
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    disabled={busyItem === item.id}
                    className="text-xs font-medium text-rose-600 hover:text-rose-800 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
            <span className="text-sm text-slate-500">Subtotal</span>
            <span className="text-lg font-bold text-slate-900">{money(cart.subtotal)}</span>
          </div>
        </>
      )}
      {error && (
        <div
          role="alert"
          className="mx-5 mb-4 flex items-start justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          <span>{error}</span>
          <button type="button" onClick={onClearError} aria-label="Dismiss" className="font-bold">
            ×
          </button>
        </div>
      )}
    </aside>
  );
}

type ProductDraft = {
  price?: string;
  stock?: string;
  is_active?: boolean;
};

function AdminPanel({
  products,
  onRefresh,
  onRefreshProducts,
}: {
  products: Product[];
  onRefresh: () => void;
  onRefreshProducts: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Record<number, ProductDraft>>({});

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    const numericPrice = Number(price);
    const numericStock = Number(stock);
    if (
      !Number.isFinite(numericPrice) ||
      numericPrice < 0 ||
      !Number.isFinite(numericStock) ||
      numericStock < 0
    ) {
      setError("Price and stock must be non-negative numbers.");
      return;
    }
    setBusy(true);
    try {
      await api.createProduct({
        name: name.trim(),
        description: description.trim(),
        price: numericPrice,
        stock: numericStock,
        is_active: isActive,
      });
      setName("");
      setDescription("");
      setPrice("");
      setStock("");
      setIsActive(true);
      setNotice("Product added.");
      onRefresh();
      onRefreshProducts();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const draft = (product: Product): ProductDraft => editing[product.id] ?? {};
  const setField = <K extends keyof ProductDraft>(
    id: number,
    field: K,
    value: ProductDraft[K],
  ) => {
    setEditing((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? {}), [field]: value },
    }));
  };
  const hasChanges = (product: Product) => Object.keys(draft(product)).length > 0;

  const save = async (product: Product) => {
    setError("");
    setNotice("");
    const changes = { ...draft(product) };
    const payload: {
      price?: number;
      stock?: number;
      is_active?: boolean;
    } = {};
    if (changes.price !== undefined) payload.price = Number(changes.price);
    if (changes.stock !== undefined) payload.stock = Number(changes.stock);
    if (changes.is_active !== undefined) payload.is_active = changes.is_active;
    if (
      (payload.price !== undefined && (!Number.isFinite(payload.price) || payload.price < 0)) ||
      (payload.stock !== undefined && (!Number.isFinite(payload.stock) || payload.stock < 0))
    ) {
      setError("Price and stock must be non-negative numbers.");
      return;
    }
    try {
      await api.updateProduct(product.id, payload);
      setEditing((prev) => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
      setNotice(`Saved ${product.name}.`);
      onRefresh();
      onRefreshProducts();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const inputClass =
    "w-full rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200";

  return (
    <section className="mb-8 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-bold uppercase tracking-wide text-white">
          Admin
        </span>
        <h2 className="text-lg font-bold text-slate-900">Manage products</h2>
      </div>
      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && <p className="mb-4 text-sm font-medium text-emerald-700">{notice}</p>}

      <form onSubmit={create} className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="sm:col-span-2 lg:col-span-1">
          <span className="mb-1 block text-xs font-medium text-slate-600">Name</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="sm:col-span-2 lg:col-span-1">
          <span className="mb-1 block text-xs font-medium text-slate-600">Description</span>
          <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-slate-600">Price</span>
          <input
            type="number"
            min="0"
            step="0.01"
            className={inputClass}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-slate-600">Stock</span>
          <input
            type="number"
            min="0"
            step="1"
            className={inputClass}
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            required
          />
        </label>
        <div className="flex items-end gap-3">
          <label className="flex h-[34px] items-center gap-2 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4"
            />
            Active
          </label>
          <button
            type="submit"
            disabled={busy}
            className="h-[34px] rounded-md bg-slate-900 px-4 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
          >
            Add product
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-semibold">Product</th>
              <th className="px-4 py-2 font-semibold">Price</th>
              <th className="px-4 py-2 font-semibold">Stock</th>
              <th className="px-4 py-2 font-semibold">Active</th>
              <th className="px-4 py-2 font-semibold" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.map((product: Product) => {
              const d = draft(product);
              return (
                <tr key={product.id} className={product.is_active ? "" : "bg-slate-50 text-slate-400"}>
                  <td className="px-4 py-2">
                    <p className="font-medium text-slate-800">{product.name}</p>
                    <p className="text-xs text-slate-400">#{product.id}</p>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      aria-label={`Price for ${product.name}`}
                      className={`${inputClass} w-24`}
                      value={d.price ?? product.price}
                      onChange={(e) => setField(product.id, "price", e.target.value)}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      aria-label={`Stock for ${product.name}`}
                      className={`${inputClass} w-20`}
                      value={d.stock ?? product.stock}
                      onChange={(e) => setField(product.id, "stock", e.target.value)}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() =>
                        setField(product.id, "is_active", !(d.is_active ?? product.is_active))
                      }
                      aria-label={`Toggle active for ${product.name}`}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        (d.is_active ?? product.is_active)
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      {(d.is_active ?? product.is_active) ? "Active" : "Hidden"}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      disabled={!hasChanges(product)}
                      onClick={() => save(product)}
                      className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400"
                    >
                      Save
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const PAGE_SIZE = 8;

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [pageData, setPageData] = useState<ProductPage | null>(null);
  const [query, setQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [productsError, setProductsError] = useState("");
  const [cart, setCart] = useState<Cart>({ items: [], subtotal: 0 });
  const [cartError, setCartError] = useState("");
  const [addBusy, setAddBusy] = useState<number | null>(null);
  const [cartBusy, setCartBusy] = useState<number | null>(null);
  const [adminProducts, setAdminProducts] = useState<Product[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  const refreshCart = useCallback(async () => {
    if (!getToken()) {
      setCart({ items: [], subtotal: 0 });
      return;
    }
    try {
      setCart(await api.cart());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setToken(null);
        setMe(null);
        setCart({ items: [], subtotal: 0 });
      } else {
        setCartError(errorMessage(err));
      }
    }
  }, []);

  const refreshProducts = useCallback(async () => {
    try {
      setPageData(await api.products(query, page, PAGE_SIZE));
      setProductsError("");
    } catch (err) {
      setProductsError(errorMessage(err));
    }
  }, [query, page]);

  const refreshAdminProducts = useCallback(async () => {
    try {
      setAdminProducts((await api.adminProducts()).items);
    } catch {
      setAdminProducts([]);
    }
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setAuthReady(true);
      return;
    }
    api
      .me()
      .then((result) => setMe(result))
      .catch(() => {
        setToken(null);
        setMe(null);
      })
      .finally(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    void refreshProducts();
  }, [refreshProducts]);

  useEffect(() => {
    void refreshCart();
  }, [me, refreshCart]);

  useEffect(() => {
    if (me?.is_admin) void refreshAdminProducts();
    else setAdminProducts([]);
  }, [me, refreshAdminProducts]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setQuery(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const signedIn = me !== null;

  const onSignedIn = (user: Me) => {
    setMe(user);
    setCartError("");
  };

  const signOut = async () => {
    try {
      await api.logout();
    } catch {
      /* clear locally regardless */
    }
    setToken(null);
    setMe(null);
    setCart({ items: [], subtotal: 0 });
    setCartError("");
    setCartOpen(false);
  };

  const addToCart = async (product: Product) => {
    if (!signedIn) return;
    setCartError("");
    setAddBusy(product.id);
    try {
      setCart(await api.addToCart(product.id, 1));
      setCartOpen(true);
    } catch (err) {
      setCartError(errorMessage(err));
      setCartOpen(true);
    } finally {
      setAddBusy(null);
    }
  };

  const setQuantity = async (itemId: number, quantity: number) => {
    setCartError("");
    setCartBusy(itemId);
    try {
      setCart(await api.setQuantity(itemId, quantity));
    } catch (err) {
      setCartError(errorMessage(err));
    } finally {
      setCartBusy(null);
    }
  };

  const removeItem = async (itemId: number) => {
    setCartError("");
    setCartBusy(itemId);
    try {
      setCart(await api.removeItem(itemId));
    } catch (err) {
      setCartError(errorMessage(err));
    } finally {
      setCartBusy(null);
    }
  };

  const cartCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPages = pageData ? Math.max(1, Math.ceil(pageData.total / pageData.page_size)) : 1;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-lg font-black text-white">
              S
            </div>
            <span className="text-lg font-bold tracking-tight">Shop</span>
          </div>

          <div className="flex items-center gap-3">
            {signedIn ? (
              <>
                <span className="hidden text-sm text-slate-600 sm:inline">
                  Hi, <span className="font-semibold text-slate-900">{me.username}</span>
                  {me.is_admin && (
                    <span className="ml-1 rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-bold text-indigo-700">
                      admin
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Sign out
                </button>
              </>
            ) : (
              <span className="hidden text-sm text-slate-500 sm:inline">Not signed in</span>
            )}
            <button
              type="button"
              onClick={() => setCartOpen((open) => !open)}
              aria-label="Toggle cart"
              className="relative flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13 5.4 5M7 13l-2.3 2.3A1 1 0 0 0 5.4 17H19" />
                <circle cx="9" cy="20" r="1" />
                <circle cx="18" cy="20" r="1" />
              </svg>
              <span className="hidden sm:inline">Cart</span>
              <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-500 px-1 text-xs font-bold text-white">
                {cartCount}
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {!signedIn && authReady && (
          <div className="mb-8 flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-center sm:gap-10">
            <div className="max-w-sm">
              <h1 className="text-2xl font-bold text-slate-900">A little shop</h1>
              <p className="mt-2 text-sm text-slate-600">
                Browse the catalogue, then sign in or register to keep a personal cart with
                prices always taken from the catalogue.
              </p>
            </div>
            <AuthPanel onSignedIn={onSignedIn} />
          </div>
        )}

        {me?.is_admin && (
          <AdminPanel
            products={adminProducts}
            onRefresh={() => {
              void refreshAdminProducts();
              void refreshCart();
            }}
            onRefreshProducts={() => void refreshProducts()}
          />
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
          <section>
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Products</h2>
                <p className="text-sm text-slate-500">
                  {pageData ? `${pageData.total} products` : "Loading…"}
                </p>
              </div>
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search products…"
                aria-label="Search products"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 sm:w-64"
              />
            </div>

            {productsError && (
              <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {productsError}
              </p>
            )}

            {!pageData ? (
              <div className="py-16 text-center text-sm text-slate-500">Loading products…</div>
            ) : pageData.items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center text-sm text-slate-500">
                No products match your search.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {pageData.items.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    signedIn={signedIn}
                    onAdd={addToCart}
                    busy={addBusy === product.id}
                  />
                ))}
              </div>
            )}

            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-slate-500">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </section>

          <div className="hidden lg:block">
            <div className="sticky top-20">
              <CartPanel
                cart={cart}
                signedIn={signedIn}
                onSetQuantity={setQuantity}
                onRemove={removeItem}
                busyItem={cartBusy}
                error={cartError}
                onClearError={() => setCartError("")}
              />
            </div>
          </div>
        </div>
      </main>

      {cartOpen && (
        <div className="fixed inset-0 z-30 flex justify-end bg-slate-900/40 lg:hidden" onClick={() => setCartOpen(false)}>
          <div className="h-full w-full max-w-sm overflow-y-auto bg-slate-50 p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700"
              >
                Close
              </button>
            </div>
            <CartPanel
              cart={cart}
              signedIn={signedIn}
              onSetQuantity={setQuantity}
              onRemove={removeItem}
              busyItem={cartBusy}
              error={cartError}
              onClearError={() => setCartError("")}
            />
          </div>
        </div>
      )}

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        Shop · prices are always taken from the catalogue
      </footer>
    </div>
  );
}
