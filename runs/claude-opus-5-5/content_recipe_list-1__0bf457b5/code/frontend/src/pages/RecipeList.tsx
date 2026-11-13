import { useEffect, useState } from "react";
import { ApiError, api, type Page, type RecipeSummary } from "../api";
import { Link, navigate } from "../router";
import { Badge, ErrorBanner, Spinner, formatMinutes, inputClass, secondaryButton } from "../ui";

const PAGE_SIZE = 9;

function buildUrl(params: { category: string; q: string; page: number }) {
  const qs = new URLSearchParams();
  if (params.category) qs.set("category", params.category);
  if (params.q) qs.set("q", params.q);
  if (params.page > 1) qs.set("page", String(params.page));
  const s = qs.toString();
  return s ? `/?${s}` : "/";
}

export default function RecipeList({ search }: { search: string }) {
  const params = new URLSearchParams(search);
  const category = params.get("category") ?? "";
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);

  const [data, setData] = useState<Page<RecipeSummary> | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(q);

  useEffect(() => {
    setQuery(q);
  }, [q]);

  useEffect(() => {
    api
      .categories()
      .then((r) => setCategories(r.items))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .listRecipes({ category, q, page, page_size: PAGE_SIZE })
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load recipes.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, q, page]);

  useEffect(() => {
    if (query.trim() === q) return;
    const t = window.setTimeout(() => {
      navigate(buildUrl({ category, q: query.trim(), page: 1 }), true);
    }, 300);
    return () => window.clearTimeout(t);
  }, [query, q, category]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const allCategories =
    category && !categories.some((c) => c.toLowerCase() === category.toLowerCase())
      ? [...categories, category]
      : categories;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="search" className="mb-1 block text-sm font-medium text-stone-700">
            Search by title
          </label>
          <input
            id="search"
            type="search"
            placeholder="e.g. pancakes"
            className={inputClass}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="sm:w-56">
          <label htmlFor="category" className="mb-1 block text-sm font-medium text-stone-700">
            Category
          </label>
          <select
            id="category"
            className={inputClass}
            value={category}
            onChange={(e) => navigate(buildUrl({ category: e.target.value, q, page: 1 }))}
          >
            <option value="">All categories</option>
            {allCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <ErrorBanner message={error} />

      {loading && !data ? (
        <Spinner />
      ) : data && data.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 bg-white py-16 text-center text-stone-500">
          No recipes found.
        </div>
      ) : (
        data && (
          <ul
            className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${loading ? "opacity-60" : ""}`}
          >
            {data.items.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/recipes/${r.id}`}
                  className="flex h-full flex-col rounded-xl border border-stone-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md"
                >
                  <div className="mb-3">
                    <Badge>{r.category}</Badge>
                  </div>
                  <h2 className="mb-4 text-lg font-semibold text-stone-900">{r.title}</h2>
                  <div className="mt-auto flex items-center justify-between text-sm text-stone-500">
                    <span>Prep: {formatMinutes(r.prep_minutes)}</span>
                    <span>by {r.author}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )
      )}

      {data && data.total > 0 && (
        <nav className="flex items-center justify-between" aria-label="Pagination">
          <button
            type="button"
            className={secondaryButton}
            disabled={page <= 1}
            onClick={() => navigate(buildUrl({ category, q, page: page - 1 }))}
          >
            ← Previous
          </button>
          <span className="text-sm text-stone-600">
            Page {Math.min(page, totalPages)} of {totalPages} · {data.total} recipe
            {data.total === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            className={secondaryButton}
            disabled={page >= totalPages}
            onClick={() => navigate(buildUrl({ category, q, page: page + 1 }))}
          >
            Next →
          </button>
        </nav>
      )}
    </div>
  );
}
