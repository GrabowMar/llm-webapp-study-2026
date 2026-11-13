import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Check, ChefHat, Heart, LogOut, Plus, Sprout, X } from "lucide-react";
import { api, ApiError } from "./api";
import AuthForm from "./AuthForm";
import RecipeBook from "./RecipeBook";
import RecipeDetail from "./RecipeDetail";
import RecipeForm from "./RecipeForm";
import { Modal, primaryButton } from "./ui";

function storedToken() {
  try { return localStorage.getItem("table-thyme-token") || ""; } catch { return ""; }
}

export default function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [token, setToken] = useState(storedToken);
  const [username, setUsername] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register" | null>(null);
  const [pendingPath, setPendingPath] = useState("");
  const [about, setAbout] = useState(false);
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);

  const navigate = useCallback((next: string) => {
    window.history.pushState({}, "", next);
    setPath(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  const clearSession = useCallback(() => {
    setToken("");
    setUsername("");
    try { localStorage.removeItem("table-thyme-token"); } catch {}
  }, []);

  const sessionExpired = useCallback(() => {
    clearSession();
    setAuthMode("login");
    setNotice("Your session has expired. Sign in to continue.");
  }, [clearSession]);

  useEffect(() => {
    const listener = () => setPath(window.location.pathname);
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, []);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    api<{ username: string }>("/auth/me", { signal: controller.signal }, token)
      .then(user => setUsername(user.username))
      .catch(error => {
        if (error instanceof ApiError && error.status === 401) clearSession();
        else if (!(error instanceof DOMException && error.name === "AbortError")) setNotice("Couldn’t verify your session. Try refreshing the page.");
      });
    return () => controller.abort();
  }, [token, clearSession]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  function openAuth(mode: "login" | "register", next = "") {
    setPendingPath(next);
    setAuthMode(mode);
  }

  function addRecipe() {
    if (token) navigate("/recipes/new");
    else openAuth("login", "/recipes/new");
  }

  async function signOut() {
    try { await api("/auth/logout", { method: "POST" }, token); }
    catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        setNotice("Couldn’t sign out. Please try again.");
        return;
      }
    }
    clearSession();
    setNotice("You’re signed out. There’s always a seat for you here.");
  }

  const detailMatch = path.match(/^\/recipes\/(\d+)\/?$/);
  const editMatch = path.match(/^\/recipes\/(\d+)\/edit\/?$/);
  const newRecipe = path === "/recipes/new";
  const isBook = path === "/" || path === "/recipes";

  return <div className="flex min-h-dvh flex-col">
    <header className="border-b border-line bg-cream">
      <div className="mx-auto flex min-h-24 max-w-7xl flex-wrap items-center justify-between gap-x-5 gap-y-3 px-5 py-5 sm:px-8 lg:px-12">
        <a href="/" onClick={event => { event.preventDefault(); navigate("/"); }} className="flex shrink-0 items-center gap-2.5" aria-label="Table and Thyme home">
          <Sprout className="text-olive" size={31} strokeWidth={1.5} /><span className="font-serif text-[27px] tracking-[-1px] sm:text-[29px]">Table <span className="italic text-olive">&</span> Thyme<span className="text-terra">.</span></span>
        </a>
        <nav aria-label="Main navigation" className="ml-8 hidden items-center gap-8 self-stretch text-[13px] md:flex">
          <a href="/" onClick={event => { event.preventDefault(); navigate("/"); }} aria-current={isBook ? "page" : undefined} className={`flex items-center border-b-2 px-1 ${isBook ? "border-olive font-medium" : "border-transparent text-muted hover:text-ink"}`}>The recipe book</a>
          <button onClick={() => setAbout(true)} className="text-muted transition hover:text-ink">Our philosophy</button>
        </nav>
        <div className="ml-auto flex items-center gap-3 sm:gap-5">
          {token ? <div className="flex items-center gap-2 sm:gap-3"><span className="hidden max-w-32 truncate text-sm sm:block">Hi, <span className="font-medium">{username || "cook"}</span></span><button onClick={signOut} className="flex items-center gap-1.5 text-xs text-muted hover:text-ink" aria-label="Sign out"><LogOut size={15} /><span className="hidden sm:inline">Sign out</span></button></div> : <button onClick={() => openAuth("login")} className="px-1 text-sm font-medium transition hover:text-olive">Sign in</button>}
          <button onClick={addRecipe} className={`${primaryButton} !gap-1.5 !px-3.5 !py-2.5 sm:!px-4`}><Plus size={16} /><span className="hidden min-[420px]:inline">Add a recipe</span><span className="min-[420px]:hidden">Add</span></button>
        </div>
      </div>
    </header>

    <main className="mx-auto w-full max-w-7xl flex-1 px-5 sm:px-8 lg:px-12">
      {isBook ? <RecipeBook revision={revision} onOpen={id => navigate(`/recipes/${id}`)} onShare={() => token ? navigate("/recipes/new") : openAuth("register", "/recipes/new")} /> :
        detailMatch ? <RecipeDetail key={detailMatch[1]} id={Number(detailMatch[1])} username={username} token={token} onBack={() => navigate("/")} onEdit={() => navigate(`/recipes/${detailMatch[1]}/edit`)} onDeleted={() => { setRevision(value => value + 1); setNotice("Recipe deleted."); navigate("/"); }} onUnauthorized={sessionExpired} /> :
        newRecipe || editMatch ? <RecipeForm key={editMatch?.[1] || "new"} id={editMatch ? Number(editMatch[1]) : undefined} token={token} username={username} onSignIn={() => openAuth("login")} onCancel={() => navigate(editMatch ? `/recipes/${editMatch[1]}` : "/")} onSaved={recipe => { setRevision(value => value + 1); setNotice(editMatch ? "Your recipe has been updated." : "Your recipe is at the table. Thanks for sharing!"); navigate(`/recipes/${recipe.id}`); }} onUnauthorized={sessionExpired} /> :
        <div className="py-28 text-center"><h1 className="mb-4 font-serif text-4xl">This page isn’t on the menu.</h1><button onClick={() => navigate("/")} className={primaryButton}>Back to the recipe book <ArrowRight size={16} /></button></div>}
    </main>

    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 py-7 text-xs text-muted sm:flex-row sm:px-8 lg:px-12">
        <span className="flex items-center gap-2"><Sprout size={16} className="text-olive" /> A recipe book for all of us.</span>
        <span className="flex items-center gap-1.5">Made with care. Shared with <Heart size={12} className="text-terra" />.</span>
        <button onClick={() => setAbout(true)} className="transition hover:text-ink">A little about Table & Thyme <ArrowRight size={12} className="ml-1 inline" /></button>
      </div>
    </footer>

    {authMode && <AuthForm key={authMode} mode={authMode} onMode={setAuthMode} onClose={() => { setAuthMode(null); setPendingPath(""); }} onLogin={(nextToken, name) => {
      try { localStorage.setItem("table-thyme-token", nextToken); } catch {}
      setToken(nextToken); setUsername(name); setAuthMode(null); setNotice(`Welcome to the kitchen, ${name}.`);
      if (pendingPath) navigate(pendingPath);
      setPendingPath("");
    }} />}
    {about && <Modal title="Good food brings us together." onClose={() => setAbout(false)} wide>
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-sage text-olive"><ChefHat size={32} strokeWidth={1.5} /></div>
      <div className="space-y-4 text-sm leading-7 text-muted"><p>Table & Thyme is a little corner of the internet for the recipes you make again and again. The easy weekday dinner. The pancakes everyone asks for. The dish that tastes like home.</p><p>No perfect kitchens required. Just simple ingredients, a little curiosity, and something worth sharing.</p><p>Everyone is welcome to browse. Make an account to add your own recipes, and edit them whenever inspiration strikes.</p></div>
      <button className={`${primaryButton} mt-7`} onClick={() => { setAbout(false); addRecipe(); }}>Share a little of your kitchen <ArrowRight size={16} /></button>
    </Modal>}
    {notice && <div role="status" className="fixed bottom-5 left-1/2 z-50 flex w-[calc(100%-2.5rem)] max-w-lg -translate-x-1/2 items-center gap-3 rounded-xl border border-line bg-white p-4 text-sm shadow-xl"><Check size={18} className="shrink-0 text-olive" /><span className="flex-1">{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss notification" className="p-1 text-muted"><X size={16} /></button></div>}
  </div>;
}
