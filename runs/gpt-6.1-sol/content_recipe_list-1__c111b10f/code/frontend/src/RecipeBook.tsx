import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, BookOpen, ChefHat, ChevronDown, ChevronLeft, ChevronRight, Clock3, Coffee, Heart, Leaf, Plus, Search, SlidersHorizontal, Sprout, Utensils, X } from "lucide-react";
import { api, type RecipePage, type RecipeSummary } from "./api";
import FoodArt, { dishFor } from "./FoodArt";
import { ErrorBox, Loading, primaryButton, secondaryButton } from "./ui";

const categoryStyle = (category: string) => ({ Breakfast: "bg-[#f5ead6] text-[#8c7042]", Lunch: "bg-[#e9efdc] text-[#62784b]", Dinner: "bg-[#f2e4da] text-[#9e6245]", Dessert: "bg-[#f1e3e7] text-[#9c6276]" }[category] || "bg-sage text-olive");

function RecipeCard({ recipe, onOpen }: { recipe: RecipeSummary; onOpen: () => void }) {
  return <article className="group overflow-hidden rounded-xl border border-line bg-white transition duration-300 hover:-translate-y-1 hover:border-olive/35 hover:shadow-lg hover:shadow-ink/5">
    <a href={`/recipes/${recipe.id}`} onClick={event => { event.preventDefault(); onOpen(); }} className="block h-full">
      <div className="relative aspect-[1.65] overflow-hidden bg-sage">
        <FoodArt dish={dishFor(recipe.title, recipe.category)} className="transition duration-700 group-hover:scale-105" />
        <span className={`absolute left-4 top-4 rounded-md px-2.5 py-1 text-[10px] font-semibold tracking-wide ${categoryStyle(recipe.category)}`}>{recipe.category}</span>
      </div>
      <div className="p-5">
        <div className="mb-3 flex items-center gap-1.5 text-[11px] text-muted"><Clock3 size={13} strokeWidth={1.6} />{recipe.prep_minutes} min<span className="mx-1.5 text-line">|</span><span>Made for real life</span></div>
        <h3 className="min-h-7 font-serif text-[23px] leading-7 tracking-[-.45px] transition group-hover:text-olive">{recipe.title}</h3>
        <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
          <div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-sage font-serif text-xs text-olive">{recipe.author.charAt(0).toUpperCase()}</span><span className="text-[11px] text-muted">From <span className="font-medium text-ink/80">{recipe.author}</span>’s kitchen</span></div>
          <ArrowRight size={16} strokeWidth={1.5} className="text-olive transition group-hover:translate-x-1" />
        </div>
      </div>
    </a>
  </article>;
}

export default function RecipeBook({ revision, onOpen, onShare }: { revision: number; onOpen: (id: number) => void; onShare: () => void }) {
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);
  const [categories, setCategories] = useState<string[]>([]);
  const [result, setResult] = useState<RecipePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const book = useRef<HTMLElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    api<{ items: string[] }>("/categories", { signal: controller.signal }).then(data => setCategories(data.items)).catch(() => {});
    return () => controller.abort();
  }, [revision, retry]);

  useEffect(() => {
    const timeout = window.setTimeout(() => { setQuery(search); setPage(1); }, 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ category, q: query, page: String(page), page_size: String(pageSize) });
    api<RecipePage>(`/recipes?${params}`, { signal: controller.signal })
      .then(data => {
        if (data.total > 0 && page > Math.ceil(data.total / pageSize)) setPage(Math.ceil(data.total / pageSize));
        else setResult(data);
      })
      .catch(caught => { if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(caught.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [category, query, page, pageSize, revision, retry]);

  function selectCategory(next: string) { setCategory(next); setPage(1); }
  function browse() { book.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  const tabs = [...["Breakfast", "Lunch", "Dinner", "Dessert"].filter(item => categories.includes(item)), ...categories.filter(item => !["Breakfast", "Lunch", "Dinner", "Dessert"].includes(item))];
  const pages = Math.max(1, Math.ceil((result?.total || 0) / pageSize));

  return <>
    <section className="relative mt-9 overflow-hidden rounded-2xl bg-[#edf0e7] md:mt-10" aria-labelledby="hero-heading">
      <div className="relative z-10 px-7 pb-8 pt-10 sm:px-10 lg:px-12 lg:py-12 md:w-[53%]">
        <div className="mb-5 flex items-center gap-2 text-[10px] font-semibold tracking-[2px] text-olive"><span className="h-1.5 w-1.5 rounded-full bg-olive" /> FROM OUR KITCHENS TO YOURS</div>
        <h1 id="hero-heading" className="font-serif text-[43px] leading-[1.13] tracking-[-1.6px] sm:text-[52px] lg:text-[58px]">A little inspiration.<br />A lot of <span className="italic text-olive">good food.</span></h1>
        <p className="mt-5 max-w-sm text-[13px] leading-[1.9] text-muted">Everyday recipes. Something for every craving.<br className="hidden lg:block" /> A collection made by home cooks, for home cooks.</p>
        <div className="mt-7 flex flex-wrap items-center gap-5">
          <button onClick={browse} className={`${primaryButton} !px-5 !text-xs`}>Explore the recipes <ArrowDown size={15} /></button>
          <button onClick={onShare} className="flex items-center gap-1.5 text-xs font-medium text-olive underline decoration-olive/30 underline-offset-4 transition hover:text-ink">Share your favorite <ArrowRight size={14} /></button>
        </div>
      </div>
      <div className="relative h-60 md:absolute md:inset-y-0 md:right-0 md:h-auto md:w-[51%]">
        <FoodArt hero />
        <div className="absolute right-6 top-5 flex h-[83px] w-[83px] rotate-12 flex-col items-center justify-center rounded-full border border-olive/35 bg-[#edf0e7]/80 text-olive backdrop-blur-sm lg:right-8 lg:top-7"><Sprout size={21} strokeWidth={1.3} /><span className="mt-1 text-[8px] font-medium tracking-[1.1px]">FRESH IDEAS</span><span className="mt-0.5 font-serif text-[10px] italic">every day</span></div>
        <div className="absolute bottom-6 left-7 flex -rotate-3 items-center gap-3 rounded-lg border border-white/70 bg-cream/95 px-4 py-3 shadow-sm md:bottom-8 md:left-9"><Heart size={18} strokeWidth={1.5} className="text-terra" /><span className="font-serif text-sm italic">Good food. Good company.</span></div>
      </div>
    </section>

    <div className="mt-5 grid grid-cols-1 gap-3 border-b border-line pb-6 text-[11px] text-muted min-[540px]:grid-cols-3 min-[540px]:gap-1">
      <span className="flex items-center justify-center gap-2"><Leaf size={15} strokeWidth={1.5} className="text-olive" /> Simple ingredients, lovely results</span>
      <span className="flex items-center justify-center gap-2"><ChefHat size={16} strokeWidth={1.5} className="text-olive" /> From real home cooks</span>
      <span className="flex items-center justify-center gap-2"><Heart size={14} strokeWidth={1.5} className="text-olive" /> A little something for everyone</span>
    </div>

    <section ref={book} className="scroll-mt-6 pt-9" aria-labelledby="recipes-heading">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div><div className="mb-2 text-[9px] font-semibold tracking-[1.8px] text-terra">THE RECIPE BOOK</div><h2 id="recipes-heading" className="font-serif text-[32px] leading-tight tracking-[-.7px] sm:text-[35px]">Find your next favorite<span className="text-terra">.</span></h2><p className="mt-2 text-xs text-muted">A few good ingredients. A recipe worth keeping.</p></div>
        <span className="mb-1 flex items-center gap-1.5 text-[11px] text-muted"><SlidersHorizontal size={13} strokeWidth={1.5} /> Newest additions first</span>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-white px-4 py-3">
        <div className="flex max-w-full items-center gap-1 overflow-x-auto" role="group" aria-label="Filter by category">
          <button onClick={() => selectCategory("")} aria-pressed={!category} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs transition ${!category ? "bg-sage font-medium text-olive" : "text-muted hover:bg-cream"}`}><BookOpen size={14} />All recipes</button>
          {tabs.map(item => <button key={item} onClick={() => selectCategory(item)} aria-pressed={category === item} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs transition ${category === item ? "bg-sage font-medium text-olive" : "text-muted hover:bg-cream"}`}>{item === "Breakfast" ? <Coffee size={13} /> : item === "Dinner" ? <Utensils size={13} /> : item === "Lunch" ? <Leaf size={13} /> : item === "Dessert" ? <Heart size={13} /> : null}{item}</button>)}
        </div>
        <div className="flex w-full items-center gap-2 border-t border-line pt-3 lg:w-auto lg:border-0 lg:pt-0">
          <div className="relative min-w-0 flex-1 lg:w-48"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input aria-label="Search recipe titles" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find something delicious…" className="w-full rounded-lg border border-line bg-cream py-2.5 pl-9 pr-3 text-[11px] placeholder:text-muted focus:border-olive focus:outline-none" /></div>
          <div className="relative"><select aria-label="Recipe category" value={category} onChange={event => selectCategory(event.target.value)} className="max-w-36 appearance-none rounded-lg border border-line bg-cream py-2.5 pl-3 pr-7 text-[11px] text-muted focus:border-olive"><option value="">All categories</option>{categories.map(item => <option key={item}>{item}</option>)}</select><ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" /></div>
        </div>
      </div>

      <div className="mb-5 flex items-center justify-between text-[11px] text-muted" aria-live="polite"><span>{loading ? "Finding your next favorite…" : `${result?.total || 0} ${(result?.total || 0) === 1 ? "recipe" : "recipes"}${category ? ` in ${category.toLowerCase()}` : " to make your own"}${query ? ` matching “${query}”` : ""}`}</span>{(category || search) && <button onClick={() => { setSearch(""); setQuery(""); selectCategory(""); }} className="flex items-center gap-1 text-olive hover:underline">Clear filters <X size={12} /></button>}</div>

      {error ? <div className="space-y-4 py-6"><ErrorBox message={error} /><button onClick={() => setRetry(value => value + 1)} className={secondaryButton}>Try again</button></div> : loading ? <Loading /> : result?.items.length ? <div className="grid gap-6 min-[600px]:grid-cols-2 lg:grid-cols-3">
        {result.items.map(recipe => <RecipeCard key={recipe.id} recipe={recipe} onOpen={() => onOpen(recipe.id)} />)}
        {result.items.length < pageSize && <div className="flex min-h-80 flex-col items-center justify-center rounded-xl border border-dashed border-olive/30 bg-sage/60 px-6 py-9 text-center">
          <div className="relative mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#e1e7d6]"><BookOpen size={31} strokeWidth={1.2} className="-rotate-12 text-olive" /><span className="absolute -right-1 bottom-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-sage bg-cream text-terra"><Plus size={14} /></span></div>
          <h3 className="font-serif text-[25px] tracking-tight">Your recipe belongs here.</h3><p className="mt-3 max-w-56 text-xs leading-6 text-muted">That family favorite. Your latest discovery.<br />Good things are made to be shared.</p><button onClick={onShare} className="mt-5 flex items-center gap-2 rounded-lg border border-olive/30 bg-transparent px-4 py-2.5 text-xs font-medium text-olive transition hover:bg-olive hover:text-white">Share a recipe <ArrowRight size={14} /></button>
        </div>}
      </div> : <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-line text-center"><Search size={28} className="mb-4 text-olive" strokeWidth={1.3} /><h3 className="font-serif text-2xl">Nothing on the menu just yet.</h3><p className="mt-2 text-sm text-muted">Try another title or category, or share something of your own.</p><button onClick={() => { setSearch(""); setQuery(""); selectCategory(""); }} className={`${secondaryButton} mt-5`}>See all recipes</button></div>}

      {!loading && !error && result && <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5 text-[11px] text-muted">
        <div className="flex items-center gap-4"><span>{result.total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, result.total)} of ${result.total} recipes` : "0 recipes"}</span><label className="hidden items-center gap-1.5 sm:flex">Per page <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }} className="rounded-md border border-line bg-white px-1.5 py-1 text-ink" aria-label="Recipes per page"><option value={6}>6</option><option value={12}>12</option><option value={24}>24</option></select></label></div>
        <nav aria-label="Recipe pages" className="flex items-center gap-2"><button disabled={page === 1} onClick={() => { setPage(value => value - 1); browse(); }} className="flex h-8 items-center gap-1 rounded-md border border-line bg-white px-2.5 transition hover:border-olive disabled:opacity-40"><ChevronLeft size={13} /> Previous</button><span className="px-2">{page} <span className="px-1 text-muted/50">/</span> {pages}</span><button disabled={page >= pages} onClick={() => { setPage(value => value + 1); browse(); }} className="flex h-8 items-center gap-1 rounded-md border border-line bg-white px-2.5 transition hover:border-olive disabled:opacity-40">Next <ChevronRight size={13} /></button></nav>
      </div>}
    </section>

    <aside className="mt-10 flex flex-col items-center gap-3 rounded-xl bg-[#f0ece3] px-6 py-5 text-center sm:flex-row sm:justify-between sm:text-left"><div className="flex items-center gap-3"><Sprout size={24} strokeWidth={1.3} className="shrink-0 text-olive" /><div><p className="font-serif text-lg">The best recipes have a story.</p><p className="mt-0.5 text-[11px] text-muted">We’d love to hear yours. Make yourself at home.</p></div></div><button onClick={onShare} className="flex shrink-0 items-center gap-2 text-xs font-medium text-olive transition hover:text-ink">Join our kitchen <ArrowRight size={14} /></button></aside>
  </>;
}
