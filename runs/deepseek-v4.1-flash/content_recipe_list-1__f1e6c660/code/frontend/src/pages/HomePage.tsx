import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getCategories, listRecipes, type RecipePage } from "../api";
import Pagination from "../components/Pagination";
import RecipeCard from "../components/RecipeCard";
import { Alert } from "../components/ui";
import { useAuth } from "../auth";

const PAGE_SIZE = 6;

export default function HomePage() {
  const { username } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [categories, setCategories] = useState<string[]>([]);
  const [data, setData] = useState<RecipePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState(searchParams.get("q") ?? "");

  const category = searchParams.get("category") ?? "";
  const query = searchParams.get("q") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);

  useEffect(() => {
    setSearchText(query);
  }, [query]);

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listRecipes({
      category: category || undefined,
      q: query || undefined,
      page,
      page_size: PAGE_SIZE,
    })
      .then((result) => {
        if (cancelled) return;
        if (result.items.length === 0 && result.total > 0 && page > 1) {
          setSearchParams((params) => {
            const next = new URLSearchParams(params);
            next.set("page", "1");
            return next;
          });
          return;
        }
        setData(result);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, query, page, setSearchParams]);

  useEffect(() => {
    if (searchText === query) return;
    const timer = window.setTimeout(() => {
      setSearchParams((params) => {
        const next = new URLSearchParams(params);
        if (searchText.trim()) next.set("q", searchText.trim());
        else next.delete("q");
        next.delete("page");
        return next;
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchText, query, setSearchParams]);

  function updateFilter(key: "category" | "q", value: string) {
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete("page");
      return next;
    });
  }

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-stone-900">
            Recipes
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Browse the collection, or share a dish of your own.
          </p>
        </div>
        {username && (
          <Link
            to="/recipes/new"
            className="inline-flex items-center justify-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700"
          >
            Add recipe
          </Link>
        )}
      </div>

      <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:flex-row">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400">
            ⌕
          </span>
          <input
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search recipes by title…"
            aria-label="Search recipes by title"
            className="w-full rounded-lg border border-stone-300 bg-white py-2 pl-9 pr-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
          />
        </div>
        <select
          value={category}
          onChange={(event) => updateFilter("category", event.target.value)}
          aria-label="Filter by category"
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200 sm:w-56"
        >
          <option value="">All categories</option>
          {categories.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {error && <Alert>{error}</Alert>}

      {loading && !data ? (
        <p className="py-16 text-center text-sm text-stone-500">
          Loading recipes…
        </p>
      ) : data && data.items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-16 text-center">
          <p className="text-lg font-semibold text-stone-700">
            No recipes found
          </p>
          <p className="mt-1 text-sm text-stone-500">
            Try a different search or category.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data?.items.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}

      {data && (
        <Pagination
          page={data.page}
          pageSize={data.page_size}
          total={data.total}
          onPageChange={(next) => {
            setSearchParams((params) => {
              const updated = new URLSearchParams(params);
              updated.set("page", String(next));
              return updated;
            });
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}
    </div>
  );
}
