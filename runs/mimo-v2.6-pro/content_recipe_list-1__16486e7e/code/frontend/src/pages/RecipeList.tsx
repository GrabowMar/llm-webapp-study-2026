import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import type { RecipePage } from "../types";

const PAGE_SIZE = 9;

export default function RecipeList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const category = searchParams.get("category") ?? "";
  const q = searchParams.get("q") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);

  const [searchInput, setSearchInput] = useState(q);
  const [data, setData] = useState<RecipePage | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { signedIn } = useAuth();

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      api.listRecipes({ category, q, page, page_size: PAGE_SIZE }),
      api.listCategories().catch(() => ({ categories: [] })),
    ])
      .then(([list, cats]) => {
        if (cancelled) return;
        setData(list);
        setCategories(cats.categories);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load recipes");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, q, page]);

  function updateParams(next: Record<string, string | number | null>) {
    const sp = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "") {
        sp.delete(key);
      } else {
        sp.set(key, String(value));
      }
    }
    setSearchParams(sp);
  }

  function onSearch(event: FormEvent) {
    event.preventDefault();
    updateParams({ q: searchInput, page: null });
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-stone-900">Recipes</h1>
          <p className="mt-1 text-stone-600">
            Browse every recipe, or filter by category and title.
          </p>
        </div>
        {signedIn && (
          <Link
            to="/recipes/new"
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Add recipe
          </Link>
        )}
      </div>

      <form
        onSubmit={onSearch}
        className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-stone-200 bg-white p-4"
      >
        <div className="flex min-w-56 flex-1 items-center gap-2">
          <label htmlFor="search" className="text-sm font-medium text-stone-700">
            Search
          </label>
          <input
            id="search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by title..."
            className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="category" className="text-sm font-medium text-stone-700">
            Category
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => updateParams({ category: e.target.value, page: null })}
            className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Search
        </button>
        {(q || category) && (
          <button
            type="button"
            onClick={() => {
              setSearchInput("");
              updateParams({ q: null, category: null, page: null });
            }}
            className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
          >
            Clear filters
          </button>
        )}
      </form>

      {error && (
        <div className="mb-6 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="py-10 text-center text-stone-500">Loading recipes...</p>
      ) : data && data.items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 bg-white p-10 text-center">
          <p className="text-stone-600">No recipes found.</p>
          {!signedIn && (
            <p className="mt-2 text-sm text-stone-500">
              <Link to="/signin" className="font-medium text-emerald-700 hover:underline">
                Sign in
              </Link>{" "}
              to add the first one.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data?.items.map((item) => (
            <article
              key={item.id}
              className="flex flex-col rounded-lg border border-stone-200 bg-white p-5 shadow-sm transition hover:shadow-md"
            >
              <h2 className="text-lg font-semibold text-stone-900">
                <Link to={`/recipes/${item.id}`} className="hover:text-emerald-700 hover:underline">
                  {item.title}
                </Link>
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                  {item.category}
                </span>
                <span className="text-sm text-stone-600">{item.prep_minutes} min</span>
              </div>
              <p className="mt-auto pt-3 text-sm text-stone-500">
                by <span className="font-medium text-stone-700">{item.author}</span>
              </p>
            </article>
          ))}
        </div>
      )}

      {data && data.total > 0 && (
        <div className="mt-6 flex items-center justify-between gap-4">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => updateParams({ page: page - 1 })}
            className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <p className="text-sm text-stone-600">
            Page {data.page} of {totalPages} &middot; {data.total} recipes
          </p>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => updateParams({ page: page + 1 })}
            className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
