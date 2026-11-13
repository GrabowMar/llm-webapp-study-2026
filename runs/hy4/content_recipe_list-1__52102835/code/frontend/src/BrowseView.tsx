import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type ListItem } from "./api";
import { Banner, inputClass, secondaryBtn, Spinner } from "./ui";

const PAGE_SIZE = 9;

function RecipeCard({ recipe, onOpen }: { recipe: ListItem; onOpen: (id: number) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(recipe.id)}
      className="group flex h-full w-full flex-col rounded-2xl border border-stone-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-amber-400"
    >
      <span className="inline-flex w-fit rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
        {recipe.category}
      </span>
      <h3 className="mt-3 text-lg font-bold leading-snug text-stone-900 group-hover:text-amber-800">
        {recipe.title}
      </h3>
      <div className="mt-auto flex items-center justify-between gap-2 pt-5 text-xs text-stone-500">
        <span className="inline-flex items-center gap-1">
          <span aria-hidden="true">⏱</span> {recipe.prep_minutes} min
        </span>
        <span className="truncate">by {recipe.author}</span>
      </div>
    </button>
  );
}

export function BrowseView({
  onOpenRecipe,
  refreshKey,
}: {
  onOpenRecipe: (id: number) => void;
  refreshKey: number;
}) {
  const [category, setCategory] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [categories, setCategories] = useState<string[]>([]);
  const [items, setItems] = useState<ListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .categories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, [refreshKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    api
      .listRecipes({ category, q: query, page, page_size: PAGE_SIZE })
      .then((result) => {
        setItems(result.items);
        setTotal(result.total);
        setPageSize(result.page_size);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : "Could not load recipes.");
      })
      .finally(() => setLoading(false));
  }, [category, query, page, refreshKey]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function changeCategory(value: string) {
    setCategory(value);
    setPage(1);
  }

  return (
    <section>
      <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
        <div className="flex-1">
          <label className="sr-only" htmlFor="search">
            Search recipes by title
          </label>
          <input
            id="search"
            className={inputClass}
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search recipes by title…"
          />
        </div>
        <div className="sm:w-56">
          <label className="sr-only" htmlFor="category">
            Filter by category
          </label>
          <select
            id="category"
            className={inputClass}
            value={category}
            onChange={(event) => changeCategory(event.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        {(category || query) && (
          <button
            type="button"
            className={secondaryBtn}
            onClick={() => {
              setCategory("");
              setSearchInput("");
              setQuery("");
              setPage(1);
            }}
          >
            Clear
          </button>
        )}
      </div>

      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-xl font-bold text-stone-900">
          {query ? `Results for “${query}”` : "All recipes"}
        </h2>
        <span className="text-sm text-stone-500">
          {total} {total === 1 ? "recipe" : "recipes"}
        </span>
      </div>

      {error && <Banner>{error}</Banner>}

      {loading ? (
        <Spinner label="Loading recipes…" />
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white py-16 text-center">
          <p className="text-lg font-semibold text-stone-700">No recipes found</p>
          <p className="mt-1 text-sm text-stone-500">
            Try a different search or category.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} onOpen={onOpenRecipe} />
          ))}
        </div>
      )}

      {totalPages > 1 && !loading && (
        <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Recipe pages">
          <button
            type="button"
            className={secondaryBtn}
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </button>
          <span className="text-sm font-medium text-stone-600">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className={secondaryBtn}
            disabled={page >= totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          >
            Next
          </button>
        </nav>
      )}
    </section>
  );
}
