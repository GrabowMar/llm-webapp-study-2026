import { useCallback, useEffect, useRef, useState } from "react";
import { Admin } from "./Admin";
import { api, ApiError, category, description, money } from "./api";
import type { Cart, Product, ProductPage, User } from "./api";
import { AuthForm, primaryButton } from "./AuthForm";
import { BrandMark, Icon } from "./Icons";
import { ErrorMessage, Modal } from "./Modal";
import { HeroArt, ProductArt } from "./ProductArt";

const categories = ["All objects", "Home & living", "Kitchen & dining", "Everyday essentials"];
const tileColors = ["bg-[#eee9e0]", "bg-[#eae7df]", "bg-[#e9e9df]", "bg-[#eee9e2]", "bg-[#ebe7dd]", "bg-[#e8e5dc]", "bg-[#ebe3d7]", "bg-[#efe6df]"];
const emptyCart: Cart = { items: [], subtotal: 0 };

function storedToken() {
  try { return localStorage.getItem("form-field-token"); } catch { return null; }
}

function saveToken(token: string | null) {
  try {
    if (token) localStorage.setItem("form-field-token", token);
    else localStorage.removeItem("form-field-token");
  } catch { return; }
}

export default function App() {
  const [token, setToken] = useState<string | null>(storedToken);
  const [user, setUser] = useState<User | null>(null);
  const [sessionLoading, setSessionLoading] = useState(Boolean(token));
  const [products, setProducts] = useState<ProductPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [catalogueError, setCatalogueError] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All objects");
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [cart, setCart] = useState<Cart>(emptyCart);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartLoading, setCartLoading] = useState(false);
  const [cartError, setCartError] = useState("");
  const [busyItem, setBusyItem] = useState<number | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register" | null>(null);
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
  const [detail, setDetail] = useState<Product | null>(null);
  const [detailError, setDetailError] = useState("");
  const [aboutOpen, setAboutOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);
  const collectionRef = useRef<HTMLElement>(null);
  const cartMutation = useRef(false);

  const resetSession = useCallback(() => {
    setToken(null); saveToken(null); setUser(null); setCart(emptyCart); setAdminOpen(false);
  }, []);

  const refreshCart = useCallback(async (currentToken: string) => {
    const next = await api<Cart>("/cart", {}, currentToken);
    setCart(next);
    return next;
  }, []);

  useEffect(() => {
    if (!token) { setSessionLoading(false); return; }
    let ignore = false;
    setSessionLoading(true);
    api<User>("/auth/me", {}, token).then(async (data) => {
      if (ignore) return;
      setUser(data);
      const nextCart = await api<Cart>("/cart", {}, token);
      if (!ignore) setCart(nextCart);
    }).catch((caught: Error) => {
      if (ignore) return;
      if (caught instanceof ApiError && caught.status === 401) resetSession();
      else setToast({ message: caught.message, error: true });
    }).finally(() => { if (!ignore) setSessionLoading(false); });
    return () => { ignore = true; };
  }, [token, resetSession]);

  useEffect(() => {
    const timer = window.setTimeout(() => { setQuery(search.trim()); setPage(1); }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setCatalogueError("");
    const q = query || (selectedCategory === "All objects" ? "" : selectedCategory);
    api<ProductPage>(`/products?${new URLSearchParams({ q, page: String(page), page_size: "8" })}`, { signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) setProducts(data);
    }).catch((caught: Error) => {
      if (!controller.signal.aborted) setCatalogueError(caught.message);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, selectedCategory, page, version]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!token || !user || !cartOpen) return;
    let ignore = false;
    setCartLoading(true);
    setCartError("");
    api<Cart>("/cart", {}, token).then((data) => { if (!ignore) setCart(data); }).catch((caught: Error) => {
      if (!ignore) setCartError(caught.message);
    }).finally(() => { if (!ignore) setCartLoading(false); });
    return () => { ignore = true; };
  }, [token, user, cartOpen, version]);

  async function addProduct(product: Product, currentToken = token) {
    if (!currentToken) {
      setPendingProduct(product); setDetail(null); setAuthMode("login");
      return;
    }
    if (cartMutation.current) return;
    cartMutation.current = true;
    setAdding(product.id);
    setDetailError("");
    try {
      await api("/cart", { method: "POST", body: JSON.stringify({ product_id: product.id, quantity: 1 }) }, currentToken);
      await refreshCart(currentToken);
      setDetail(null);
      setToast({ message: `${product.name} added to your cart.` });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Couldn’t add this object.";
      setToast({ message, error: true });
      setDetailError(message);
      if (caught instanceof ApiError && caught.status === 401) { resetSession(); setPendingProduct(product); setDetail(null); setAuthMode("login"); }
    } finally {
      setAdding(null);
      cartMutation.current = false;
    }
  }

  async function changeItem(id: number, quantity?: number) {
    if (!token || cartMutation.current) return;
    cartMutation.current = true;
    setBusyItem(id); setCartError("");
    try {
      await api(`/cart/${id}`, { method: quantity === undefined ? "DELETE" : "PATCH", ...(quantity !== undefined ? { body: JSON.stringify({ quantity }) } : {}) }, token);
      await refreshCart(token);
    } catch (caught) {
      setCartError(caught instanceof Error ? caught.message : "Couldn’t update your cart.");
      if (caught instanceof ApiError && caught.status === 401) resetSession();
    } finally {
      setBusyItem(null); cartMutation.current = false;
    }
  }

  async function signOut() {
    if (!token) return;
    try {
      await api("/auth/logout", { method: "POST" }, token);
      resetSession(); setCartOpen(false); setToast({ message: "You’re signed out. Your cart is saved for next time." });
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) resetSession();
      else setToast({ message: caught instanceof Error ? caught.message : "Couldn’t sign out. Please try again.", error: true });
    }
  }

  function authenticated(nextToken: string, nextUser: User) {
    saveToken(nextToken); setToken(nextToken); setUser(nextUser); setAuthMode(null);
    if (pendingProduct) { void addProduct(pendingProduct, nextToken); setPendingProduct(null); }
    else setToast({ message: `Welcome ${nextUser.username}. Make yourself at home.` });
  }

  function selectCategory(value: string) {
    setSelectedCategory(value); setSearch(""); setQuery(""); setPage(1);
  }

  function browse() {
    setAdminOpen(false);
    window.setTimeout(() => collectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 10);
  }

  function catalogueUpdated() {
    setVersion((value) => value + 1);
    if (token) void refreshCart(token).catch((caught: Error) => setToast({ message: caught.message, error: true }));
  }

  const cartCount = cart.items.reduce((count, item) => count + item.quantity, 0);
  const pages = Math.max(1, Math.ceil((products?.total ?? 0) / 8));

  return <>
    <div className="flex h-8 items-center justify-center bg-[#eeeee6] px-4 text-center text-[10px] tracking-[.09em] text-[#656b58] sm:text-[11px]"><span>Thoughtfully chosen. Made for the everyday.</span><span className="mx-3 h-1 w-1 rounded-full bg-[#a8ad98]" /><span>Good things, simply.</span></div>
    <header className="border-b border-line bg-paper">
      <div className="mx-auto flex h-[88px] max-w-[1280px] items-center justify-between gap-4 px-5 sm:px-8 lg:px-12">
        <a href="#" onClick={(event) => { event.preventDefault(); setAdminOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); }} aria-label="Form and Field home" className="flex shrink-0 items-center gap-2.5 sm:gap-3"><BrandMark className="h-6 w-6 text-rust sm:h-7 sm:w-7" /><span className="font-serif text-[25px] font-semibold tracking-[-1.3px] sm:text-[29px]">form <span className="font-normal italic">&</span> field<span className="text-rust">.</span></span></a>
        <nav aria-label="Main navigation" className="ml-8 hidden items-center gap-8 text-[13px] md:flex"><button onClick={browse} className={`relative py-2 transition hover:text-rust ${!adminOpen ? "text-rust after:absolute after:inset-x-0 after:-bottom-[22px] after:h-[2px] after:bg-rust" : "text-muted"}`}>The shop</button><button onClick={() => setAboutOpen(true)} className="text-muted transition hover:text-rust">Our philosophy</button>{user?.is_admin && <button onClick={() => setAdminOpen(true)} className={`flex items-center gap-2 transition hover:text-rust ${adminOpen ? "text-rust" : "text-muted"}`}><Icon name="settings" className="h-4 w-4" />Manage products</button>}</nav>
        <div className="flex items-center gap-3 sm:gap-6">
          {user ? <div className="flex items-center gap-3"><span className="max-w-24 truncate text-xs sm:max-w-32 sm:text-sm" title={user.username}>{user.username}</span><button onClick={() => void signOut()} aria-label="Sign out" title="Sign out" className="rounded p-1.5 text-muted hover:text-rust"><Icon name="logout" className="h-[18px] w-[18px]" /></button></div> : <button onClick={() => setAuthMode("login")} disabled={sessionLoading} className="flex items-center gap-2 rounded py-2 text-[13px] transition hover:text-rust"><Icon name="user" className="h-[18px] w-[18px]" /><span className="hidden sm:inline">{sessionLoading ? "Signing in…" : "Sign in"}</span><span className="sr-only sm:hidden">Sign in</span></button>}
          <div className="h-5 w-px bg-line" />
          <button onClick={() => setCartOpen(true)} aria-label={`Open cart, ${cartCount} ${cartCount === 1 ? "item" : "items"}`} className="flex items-center gap-2 rounded py-2 transition hover:text-rust"><Icon name="bag" className="h-5 w-5" /><span className="hidden text-[13px] lg:inline">Cart</span><span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rust px-1 text-[10px] font-medium text-white">{cartCount}</span></button>
        </div>
      </div>
      {user?.is_admin && <div className="border-t border-line px-5 py-2 md:hidden"><button onClick={() => setAdminOpen(!adminOpen)} className="flex items-center gap-2 text-xs text-rust"><Icon name="settings" className="h-4 w-4" />{adminOpen ? "Return to shop" : "Manage products"}</button></div>}
    </header>

    {adminOpen && user?.is_admin && token ? <Admin token={token} onChange={catalogueUpdated} onBack={() => setAdminOpen(false)} /> : <main className="mx-auto max-w-[1280px] px-5 sm:px-8 lg:px-12">
      <section className="relative mt-7 grid overflow-hidden rounded-lg bg-[#eae3d6] md:mt-8 md:min-h-[370px] md:grid-cols-[1fr_1.02fr]" aria-labelledby="hero-title">
        <div className="relative z-10 px-7 pt-9 pb-7 sm:px-11 sm:pt-11 md:py-12 lg:px-12">
          <div className="mb-5 flex items-center gap-2.5 text-[10px] font-medium tracking-[.19em] text-[#756b54] uppercase"><span className="h-px w-6 bg-[#a6977f]" />The everyday, considered</div>
          <h1 id="hero-title" className="font-serif text-[44px] leading-[1.09] tracking-[-1.7px] sm:text-[52px] lg:text-[58px]">Good things.<br />For everyday living.</h1>
          <p className="mt-5 max-w-[315px] text-[13px] leading-[1.85] text-[#737061]">A collection of simple, beautiful objects.<br className="hidden sm:block" /> Chosen with care. Made to feel like home.</p>
          <button onClick={browse} className={`${primaryButton} mt-7 gap-6! px-5! text-[12px]!`}>Explore the collection<Icon name="arrow" className="h-4 w-4" /></button>
        </div>
        <div className="relative -mt-12 h-[285px] sm:h-[330px] md:mt-0 md:h-full"><HeroArt /></div>
        <div className="absolute top-6 right-6 hidden text-[9px] tracking-[.17em] text-[#8c806b] uppercase sm:block">The slow living edit / No. 01</div>
      </section>

      <section aria-label="Our values" className="grid grid-cols-3 gap-2 border-b border-line py-6 sm:py-7">
        {([{ icon: "leaf", title: "Thoughtfully chosen", text: "Fewer things. Better things." }, { icon: "heart", title: "Everyday, elevated", text: "Small joys, lasting favorites." }, { icon: "box", title: "Made to be kept", text: "Good design never gets old." }] as const).map((value, index) => <div key={value.title} className={`flex flex-col items-center justify-center gap-2 text-center sm:flex-row sm:gap-3.5 sm:text-left ${index !== 2 ? "border-r border-line" : ""}`}><Icon name={value.icon} className="h-[21px] w-[21px] shrink-0 text-[#788268]" /><div><p className="text-[10px] font-medium sm:text-[12px]">{value.title}</p><p className="mt-1 hidden text-[11px] text-muted sm:block">{value.text}</p></div></div>)}
      </section>

      <section ref={collectionRef} id="collection" className="scroll-mt-6 pt-10 pb-14 sm:pt-12 sm:pb-16" aria-labelledby="collection-title">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2.5 text-[9px] font-medium tracking-[.2em] text-rust uppercase">Little things. Lasting favorites.</p><h2 id="collection-title" className="font-serif text-[30px] leading-tight tracking-[-.65px] sm:text-[34px]">Meet your new everyday.</h2><p className="mt-2.5 text-[12px] leading-relaxed text-muted">Useful, beautiful, and a little bit special. Just like the everyday should be.</p></div><span className="mb-1 hidden text-[11px] text-muted lg:block">A considered collection, not an endless catalogue.</span></div>
        <div className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="-mx-1 flex gap-1 overflow-x-auto p-1" role="group" aria-label="Product categories">{categories.map((label) => <button key={label} aria-pressed={selectedCategory === label} onClick={() => selectCategory(label)} className={`shrink-0 rounded-md px-3.5 py-2.5 text-[11px] transition sm:px-4 ${selectedCategory === label ? "bg-ink text-white" : "text-muted hover:bg-line/50 hover:text-ink"}`}>{label}</button>)}</div>
          <div className="relative w-full lg:w-[240px]"><Icon name="search" className="pointer-events-none absolute top-3 left-3.5 h-4 w-4 text-muted" /><input type="search" aria-label="Search products" placeholder="Find something good…" value={search} onChange={(event) => { setSearch(event.target.value); if (event.target.value) setSelectedCategory("All objects"); }} className="h-[40px] w-full rounded-md border border-line bg-white py-2 pr-4 pl-10 text-[11px] placeholder:text-muted/75 focus:border-rust focus:ring-offset-0" /></div>
        </div>

        {catalogueError ? <div className="rounded-lg border border-line p-7"><ErrorMessage message={catalogueError} /><button onClick={() => setVersion((value) => value + 1)} className={`${primaryButton} mt-4`}>Try again</button></div> : loading ? <div aria-label="Loading products" role="status" className="grid grid-cols-2 gap-x-5 gap-y-8 lg:grid-cols-4 lg:gap-x-6">{Array.from({ length: 8 }, (_, i) => <div key={i} className="animate-pulse"><div className="aspect-[1.12] rounded-md bg-line/70" /><div className="mt-4 h-2 w-20 rounded bg-line" /><div className="mt-3 h-4 w-3/4 rounded bg-line" /><div className="mt-3 h-3 w-12 rounded bg-line" /></div>)}</div> : products?.items.length ? <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:gap-y-9 lg:grid-cols-4 lg:gap-x-6">
          {products.items.map((product, index) => <article key={product.id} className="group min-w-0">
            <button onClick={() => { setDetail(product); setDetailError(""); }} className={`relative block aspect-[1.12] w-full overflow-hidden rounded-md ${tileColors[index % tileColors.length]}`} aria-label={`View ${product.name}`}>
              <div className="h-full w-full transition-transform duration-500 group-hover:scale-[1.045]"><ProductArt name={product.name} /></div>
              {product.stock === 0 ? <span className="absolute top-3 left-3 rounded bg-paper/90 px-2.5 py-1.5 text-[9px] font-medium tracking-wide text-muted">Out of stock</span> : product.name === "Everyday ceramic mug" ? <span className="absolute top-3 left-3 rounded bg-paper/85 px-2.5 py-1.5 text-[8px] tracking-[.12em] text-[#6c715d] uppercase">A daily ritual</span> : null}
              <span className="absolute right-3 bottom-3 rounded-full bg-paper/80 p-1.5 opacity-0 transition-opacity group-hover:opacity-100"><Icon name="arrow" className="h-3.5 w-3.5 text-[#7b786b]" /></span>
            </button>
            <div className="mt-4 flex items-end justify-between gap-2"><div className="min-w-0"><p className="mb-1.5 truncate text-[8px] tracking-[.12em] text-muted uppercase sm:text-[9px]">{categories.includes(category(product)) ? category(product) : "The collection"}</p><button onClick={() => { setDetail(product); setDetailError(""); }} className="text-left"><h3 className="text-[12px] font-medium leading-snug transition group-hover:text-rust sm:text-[14px]">{product.name}</h3></button><p className="mt-2 text-[12px] text-[#686c61] sm:text-[13px]">{money(product.price)}</p></div>
              <button onClick={() => void addProduct(product)} disabled={product.stock === 0 || adding !== null || sessionLoading} aria-label={`Add ${product.name} to cart`} title={product.stock === 0 ? "Out of stock" : "Add to cart"} className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#d8d9ce] bg-paper text-[#686e5a] transition hover:border-rust hover:bg-rust hover:text-white disabled:opacity-35 sm:h-9 sm:w-9"><Icon name={adding === product.id ? "loader" : "plus"} className={`h-4 w-4 ${adding === product.id ? "animate-spin" : ""}`} /></button>
            </div>
          </article>)}
        </div> : <div className="rounded-lg border border-dashed border-line py-16 text-center"><Icon name="search" className="mx-auto mb-4 h-8 w-8 text-muted/60" /><h3 className="font-serif text-2xl">Nothing here just yet.</h3><p className="mt-3 text-sm text-muted">Try another search, or explore the full collection.</p><button onClick={() => selectCategory("All objects")} className="mt-5 text-sm text-rust underline underline-offset-4">See all objects</button></div>}

        {!loading && !catalogueError && products && products.total > 0 && <div className="mt-10 flex flex-col items-center justify-between gap-5 border-t border-line pt-6 sm:flex-row"><p className="text-[11px] text-muted">Showing {(page - 1) * 8 + 1}–{Math.min(page * 8, products.total)} of {products.total} thoughtfully chosen objects</p><nav aria-label="Product pagination" className="flex items-center gap-2"><button aria-label="Previous page" disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="mr-1 rounded p-2 text-muted hover:text-rust disabled:opacity-30"><Icon name="chevron-left" className="h-3.5 w-3.5" /></button>{Array.from({ length: pages }, (_, i) => i + 1).filter((value) => value === 1 || value === pages || Math.abs(value - page) <= 1).map((value, index, visible) => <span key={value} className="flex items-center gap-2">{index > 0 && value - visible[index - 1] > 1 && <span className="text-xs text-muted">…</span>}<button onClick={() => setPage(value)} aria-label={`Page ${value}`} aria-current={page === value ? "page" : undefined} className={`h-8 w-8 rounded text-xs transition ${page === value ? "bg-ink text-white" : "hover:bg-line/60"}`}>{value}</button></span>)}<button aria-label="Next page" disabled={page >= pages} onClick={() => setPage((value) => value + 1)} className="ml-1 rounded p-2 text-muted hover:text-rust disabled:opacity-30"><Icon name="chevron-right" className="h-3.5 w-3.5" /></button></nav></div>}
      </section>
    </main>}

    <footer className="border-t border-[#dfded2] bg-[#eeeee6]">
      <div className="mx-auto max-w-[1280px] px-5 pt-10 pb-5 sm:px-8 lg:px-12"><div className="flex flex-col justify-between gap-7 pb-8 sm:flex-row"><div><div className="mb-4 flex items-center gap-2.5"><BrandMark className="h-5 w-5 text-rust" /><span className="font-serif text-2xl font-semibold tracking-[-1px]">form <span className="font-normal italic">&</span> field.</span></div><p className="max-w-64 text-[12px] leading-[1.8] text-[#777a6c]">A considered life, one object at a time.<br />For the spaces and rituals you call your own.</p></div><div className="flex gap-16 sm:gap-20"><div><h3 className="mb-4 text-[10px] tracking-[.1em] uppercase">A little exploring</h3><div className="flex flex-col items-start gap-3 text-[11px] text-muted"><button onClick={browse} className="hover:text-rust">The collection</button><button onClick={() => setAboutOpen(true)} className="hover:text-rust">Our philosophy</button></div></div><div><h3 className="mb-4 text-[10px] tracking-[.1em] uppercase">Make yourself at home</h3><div className="flex flex-col items-start gap-3 text-[11px] text-muted"><button onClick={() => user ? setCartOpen(true) : setAuthMode("login")} className="hover:text-rust">{user ? "Your collection" : "Your account"}</button>{!user && <button onClick={() => setAuthMode("register")} className="hover:text-rust">Join the everyday</button>}{user?.is_admin && <button onClick={() => { setAdminOpen(true); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="hover:text-rust">Product workspace</button>}</div></div></div></div><div className="flex items-center justify-between gap-4 border-t border-[#dadccf] pt-5 text-[9px] text-[#888b7c]"><span>© {new Date().getFullYear()} Form & Field</span><span className="flex items-center gap-2"><Icon name="leaf" className="h-3 w-3" />Less, but better.</span></div></div>
    </footer>

    {authMode && <AuthForm initialMode={authMode} onDismiss={() => { setAuthMode(null); setPendingProduct(null); }} onAuthenticated={authenticated} />}

    {detail && <Modal title="A closer look." onDismiss={() => setDetail(null)}><div className="overflow-y-auto"><div className="h-[270px] bg-[#eae6dc]"><ProductArt name={detail.name} /></div><div className="space-y-4 p-7"><p className="text-[10px] tracking-[.15em] text-muted uppercase">{categories.includes(category(detail)) ? category(detail) : "The collection"}</p><div className="flex items-center justify-between gap-4"><h3 className="font-serif text-[27px]">{detail.name}</h3><span className="text-lg text-rust">{money(detail.price)}</span></div><p className="text-sm leading-relaxed text-muted">{description(detail)}</p><p className={`text-xs ${detail.stock === 0 ? "text-rust" : "text-[#737e60]"}`}>{detail.stock === 0 ? "Out of stock" : `${detail.stock} available · A little everyday joy`}</p><ErrorMessage message={detailError} /><button disabled={detail.stock === 0 || adding !== null || sessionLoading} onClick={() => void addProduct(detail)} className={`${primaryButton} w-full`}><Icon name={adding === detail.id ? "loader" : "bag"} className={adding === detail.id ? "animate-spin" : ""} />{detail.stock === 0 ? "Out of stock" : adding === detail.id ? "Adding…" : "Add to your cart"}</button></div></div></Modal>}

    {aboutOpen && <Modal title="Less, but better." onDismiss={() => setAboutOpen(false)}><div className="space-y-5 p-7"><BrandMark className="mb-6 h-9 w-9 text-rust" /><h3 className="font-serif text-3xl leading-snug">Good design belongs<br />in the everyday.</h3><p className="text-sm leading-[1.85] text-muted">We believe the objects you surround yourself with should earn their place. Not by being more, but by meaning more: a mug that makes mornings feel slower, a bowl that brings people together, a notebook that holds a new beginning.</p><p className="text-sm leading-[1.85] text-muted">Form & Field is a small, considered collection for the home and beyond. Useful, beautiful objects in natural textures and quiet colors. A little less noise. A little more joy.</p><button onClick={() => { setAboutOpen(false); browse(); }} className={`${primaryButton} mt-2`}>Find your everyday<Icon name="arrow" className="h-4 w-4" /></button></div></Modal>}

    {cartOpen && <Modal title={`Your cart${cartCount ? ` (${cartCount})` : ""}`} onDismiss={() => setCartOpen(false)} drawer>
      {!user ? <div className="flex flex-1 flex-col items-center justify-center px-8 py-12 text-center"><div className="mb-6 rounded-full bg-[#eeeee6] p-5"><Icon name="bag" className="h-8 w-8 text-[#7d846c]" /></div><h3 className="font-serif text-3xl">A place for your favorites.</h3><p className="mt-4 max-w-72 text-sm leading-relaxed text-muted">Sign in to build your personal cart. We’ll keep it safe for your next visit.</p><ErrorMessage message={cartError} /><button disabled={sessionLoading} onClick={() => { setCartOpen(false); setAuthMode("login"); }} className={`${primaryButton} mt-7 w-full`}>{sessionLoading ? "Checking your account…" : "Sign in to your account"}<Icon name="arrow" className="h-4 w-4" /></button><button onClick={() => { setCartOpen(false); setAuthMode("register"); }} className="mt-5 text-sm text-rust underline underline-offset-4">Create an account</button></div> : <>
        <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
          <p className="mb-5 text-xs leading-relaxed text-muted">A few good things, chosen by {user.username}.</p>
          <ErrorMessage message={cartError} />
          {cartLoading ? <div role="status" className="flex items-center justify-center gap-3 py-16 text-sm text-muted"><Icon name="loader" className="animate-spin" />Gathering your favorites…</div> : cart.items.length ? <div className="divide-y divide-line">{cart.items.map((item) => <article key={item.id} className="flex gap-4 py-6"><div className="h-[94px] w-[90px] shrink-0 overflow-hidden rounded-md bg-[#eae6dc]"><ProductArt name={item.name} /></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><h3 className="text-sm font-medium leading-snug">{item.name}</h3><button disabled={busyItem !== null} onClick={() => void changeItem(item.id)} aria-label={`Remove ${item.name}`} className="-mt-1 rounded p-1 text-muted/75 hover:text-rust disabled:opacity-40"><Icon name="close" className="h-4 w-4" /></button></div><p className="mt-1.5 text-xs text-muted">{money(item.unit_price)} each</p><div className="mt-4 flex items-center justify-between gap-3"><div className="flex h-8 items-center rounded border border-line bg-white"><button disabled={item.quantity <= 1 || busyItem !== null} onClick={() => void changeItem(item.id, item.quantity - 1)} aria-label={`Decrease quantity of ${item.name}`} className="px-2.5 py-2 hover:text-rust disabled:opacity-30"><Icon name="minus" className="h-3 w-3" /></button><span className="min-w-7 text-center text-xs" aria-label={`Quantity ${item.quantity}`}>{busyItem === item.id ? <Icon name="loader" className="mx-auto h-3 w-3 animate-spin" /> : item.quantity}</span><button disabled={busyItem !== null} onClick={() => void changeItem(item.id, item.quantity + 1)} aria-label={`Increase quantity of ${item.name}`} className="px-2.5 py-2 hover:text-rust disabled:opacity-30"><Icon name="plus" className="h-3 w-3" /></button></div><span className="text-sm font-medium">{money(item.line_total)}</span></div></div></article>)}</div> : <div className="py-14 text-center"><Icon name="bag" className="mx-auto mb-6 h-10 w-10 text-[#a4ab96]" /><h3 className="font-serif text-[27px]">Good things are waiting.</h3><p className="mt-3 text-sm leading-relaxed text-muted">Your cart is a little quiet.<br />Find an object that feels like you.</p><button onClick={() => { setCartOpen(false); browse(); }} className={`${primaryButton} mt-6`}>Explore the collection<Icon name="arrow" className="h-4 w-4" /></button></div>}
        </div>
        <div className="shrink-0 border-t border-line bg-[#f1f0e9] px-7 py-6"><div className="flex items-center justify-between"><span className="font-serif text-xl">Subtotal</span><span className="text-xl">{money(cart.subtotal)}</span></div><p className="mt-3 text-[11px] leading-relaxed text-muted">Calculated from current catalogue prices. Items in your cart don’t reserve stock.</p><button onClick={() => { setCartOpen(false); browse(); }} className={`${primaryButton} mt-5 w-full`}>Keep exploring<Icon name="arrow" className="h-4 w-4" /></button><p className="mt-3 text-center text-[10px] text-muted">A considered collection. No rush.</p></div>
      </>}
    </Modal>}

    {toast && <div role={toast.error ? "alert" : "status"} className={`fixed right-5 bottom-5 left-5 z-50 flex items-center gap-3 rounded-lg border px-5 py-4 text-sm shadow-lg sm:left-auto sm:max-w-md ${toast.error ? "border-rust/25 bg-[#fbefe9] text-rust-dark" : "border-[#d5deca] bg-[#f0f3eb] text-[#52633e]"}`}><Icon name={toast.error ? "close" : "check"} className="h-4 w-4 shrink-0" /><span>{toast.message}</span><button onClick={() => setToast(null)} aria-label="Dismiss notification" className="ml-2 rounded p-1 opacity-60 hover:opacity-100"><Icon name="close" className="h-3.5 w-3.5" /></button></div>}
  </>;
}
