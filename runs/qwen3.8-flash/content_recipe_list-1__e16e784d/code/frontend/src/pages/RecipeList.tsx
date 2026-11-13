import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChefHat, Clock, Plus, Search, User } from "lucide-react";
import { api, ApiError, type Page, type RecipeListItem } from "../api";
import { useAuth } from "../AuthContext";
import { ErrorBanner, Spinner } from "../components";

const PAGE_SIZE = 9;

export default function RecipeList() {
  const { username } = useAuth();
  const [params, setParams] = useSearchParams();
  const category = params.get("category") ?? "";
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);

  const [categories, setCategories] = useState<string[]>([]);
  const [data, setData] = useState<Page<RecipeListItem> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchDraft, setSearchDraft] = useState(q);

  useEffect(() => {
    api
      .categories()
      .then((res) => setCategories(res.categories))
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .listRecipes({ category, q, page, page_size: PAGE_SIZE })
      .then(setData)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Failed to load recipes.")
      )
      .finally(() => setLoading(false));
  }, [category, q, page]);

  useEffect(() => {
    load();
  }, [load]);

  function updateParams(next: Record<string, string>) {
    const merged = { category, q, page: "1", ...next };
    const sp = new URLSearchParams();
    if (merged.category) sp.set("category", merged.category);
    if (merged.q) sp.set("q", merged.q);
    if (Number(merged.page) > 1) sp.set("page", merged.page);
    setParams(sp);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <form
          className="relative min-w-52 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            updateParams({ q: searchDraft.trim(), page: "1" });
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Search by title…"
            className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
          />
        </form>
        <select
          value={category}
          onChange={(e) => updateParams({ category: e.target.value, page: "1" })}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {username && (
          <Link
            to="/recipes/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700"
          >
            <Plus className="h-4 w-4" /> Add recipe
          </Link>
        )}
      </div>

      {(category || q) && (
        <p className="mb-4 text-sm text-slate-500">
          Filters active:{" "}
          {q && <span className="mr-2 rounded bg-slate-100 px-2 py-0.5">“{q}”</span>}
          {category && (
            <span className="rounded bg-slate-100 px-2 py-0.5">{category}</span>
          )}{" "}
          <button
            className="font-medium text-amber-700 hover:underline"
            onClick={() => {
              setSearchDraft("");
              setParams(new URLSearchParams());
            }}
          >
            Clear
          </button>
        </p>
      )}

      <ErrorBanner message={error} />

      {loading && !data ? (
        <Spinner />
      ) : (
        data && (
          <>
            {data.items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
                <ChefHat className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                <p className="text-slate-500">No recipes found.</p>
              </div>
            ) : (
              <div
                className={`grid gap-5 sm:grid-cols-2 lg:grid-cols-3 ${loading ? "opacity-50" : ""}`}
              >
                {data.items.map((r) => (
                  <Link
                    key={r.id}
                    to={`/recipes/${r.id}`}
                    className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <span className="mb-2 self-start rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                      {r.category}
                    </span>
                    <h2 className="mb-3 text-lg font-bold leading-snug text-slate-900 group-hover:text-amber-700">
                      {r.title}
                    </h2>
                    <div className="mt-auto flex items-center gap-4 text-sm text-slate-500">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="h-4 w-4" /> {r.prep_minutes} min
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <User className="h-4 w-4" /> {r.author}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            <div className="mt-8 flex items-center justify-between">
              <p className="text-sm text-slate-500">
                {data.total} recipe{data.total === 1 ? "" : "s"} · page {data.page} of{" "}
                {totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => updateParams({ page: String(page - 1) })}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => updateParams({ page: String(page + 1) })}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )
      )}
    </div>
  );
}
