import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type RecipeListItem } from "../api";

const PAGE_SIZE = 8;

export default function RecipeList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const category = searchParams.get("category") ?? "";
  const q = searchParams.get("q") ?? "";
  const page = Number(searchParams.get("page") ?? "1") || 1;

  const [items, setItems] = useState<RecipeListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState(q);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.categories().then((r) => setCategories(r.categories)).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listRecipes({ category, q, page, page_size: PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, q, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function updateParams(next: Record<string, string | null>) {
    const sp = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "") sp.delete(key);
      else sp.set(key, value);
    }
    setSearchParams(sp);
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-bold">Recipes</h1>
        <select
          value={category}
          onChange={(e) => updateParams({ category: e.target.value, page: null })}
          className="rounded-md border border-stone-300 bg-white px-3 py-2"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateParams({ q: searchInput, page: null });
          }}
          className="flex gap-2"
        >
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search titles…"
            className="rounded-md border border-stone-300 px-3 py-2"
          />
          <button
            type="submit"
            className="rounded-md bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700"
          >
            Search
          </button>
        </form>
      </div>

      {loading ? (
        <p className="text-stone-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-stone-500">No recipes found.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((r) => (
            <Link
              key={r.id}
              to={`/recipes/${r.id}`}
              className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm transition hover:shadow-md"
            >
              <h2 className="text-lg font-semibold">{r.title}</h2>
              <p className="mt-1 text-sm text-stone-600">
                <span className="mr-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-amber-800">
                  {r.category}
                </span>
                {r.prep_minutes != null && (
                  <span className="mr-2">{r.prep_minutes} min</span>
                )}
              </p>
              <p className="mt-2 text-sm text-stone-500">by {r.author}</p>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-3">
          <button
            disabled={page <= 1}
            onClick={() => updateParams({ page: String(page - 1) })}
            className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-stone-600">
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => updateParams({ page: String(page + 1) })}
            className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
