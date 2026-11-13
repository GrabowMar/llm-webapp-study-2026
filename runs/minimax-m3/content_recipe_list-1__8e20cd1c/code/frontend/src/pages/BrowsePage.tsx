import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import RecipeCard from "../components/RecipeCard";
import type { CategoryCount, RecipeSummary } from "../types";

const PAGE_SIZE = 9;

export default function BrowsePage() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();

  const query = params.get("q") ?? "";
  const category = params.get("category") ?? "all";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);

  const [items, setItems] = useState<RecipeSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryCount[]>([]);
  const [searchText, setSearchText] = useState(query);

  const updateParams = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  useEffect(() => {
    setSearchText(query);
  }, [query]);

  useEffect(() => {
    api
      .categories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .listRecipes({
        q: query || undefined,
        category: category !== "all" ? category : undefined,
        page,
        pageSize: PAGE_SIZE,
      })
      .then((result) => {
        if (!active) return;
        setItems(result.items);
        setTotal(result.total);
        setError(null);
      })
      .catch((cause) => {
        if (!active) return;
        setError(cause instanceof ApiError ? cause.message : "Could not load recipes.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [query, category, page]);

  useEffect(() => {
    if (searchText === query) return;
    const timer = window.setTimeout(() => {
      updateParams({ q: searchText || null, page: null });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchText, query, updateParams]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstResult = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastResult = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-stone-900">Recipes</h1>
          <p className="mt-1 text-sm text-stone-600">
            Browse what other cooks are making. Sign in to add your own.
          </p>
        </div>
        {user ? (
          <Link
            to="/recipes/new"
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-700"
          >
            Add recipe
          </Link>
        ) : (
          <Link
            to="/signin"
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
          >
            Sign in to add recipes
          </Link>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:flex-row">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="search" className="text-xs font-medium text-stone-500">
            Search titles
          </label>
          <input
            id="search"
            type="search"
            value={searchText}
            placeholder="Search for a recipe"
            onChange={(event) => setSearchText(event.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-amber-600 focus:ring-2 focus:ring-amber-200"
          />
        </div>
        <div className="flex flex-col gap-1 sm:w-56">
          <label htmlFor="category" className="text-xs font-medium text-stone-500">
            Category
          </label>
          <select
            id="category"
            value={category}
            onChange={(event) => updateParams({ category: event.target.value === "all" ? null : event.target.value, page: null })}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-200"
          >
            <option value="all">All categories</option>
            {categories.map((option) => (
              <option key={option.category} value={option.category}>
                {option.category} ({option.count})
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-stone-500">Loading recipes...</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center text-sm text-stone-600">
          No recipes found. Try a different search or category.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-stone-600">
        <span>
          {total === 0 ? "No recipes" : `Showing ${firstResult}-${lastResult} of ${total}`}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => updateParams({ page: page > 1 ? String(page - 1) : null })}
            disabled={page <= 1}
            className="rounded-lg border border-stone-300 px-3 py-1.5 font-medium text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <span className="px-1">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => updateParams({ page: page < totalPages ? String(page + 1) : null })}
            disabled={page >= totalPages}
            className="rounded-lg border border-stone-300 px-3 py-1.5 font-medium text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
