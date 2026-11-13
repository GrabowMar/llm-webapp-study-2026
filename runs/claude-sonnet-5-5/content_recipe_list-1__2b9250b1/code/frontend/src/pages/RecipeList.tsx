import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type RecipePage } from "../api";
import { ErrorBox, inputCls, secondaryBtn } from "../ui";

const PAGE_SIZE = 6;

export function RecipeList() {
  const [params, setParams] = useSearchParams();
  const category = params.get("category") ?? "";
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [search, setSearch] = useState(q);
  const [categories, setCategories] = useState<string[]>([]);
  const [data, setData] = useState<RecipePage | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.categories().then((r) => setCategories(r.items)).catch(() => {});
  }, []);

  useEffect(() => {
    setSearch(q);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    setError("");
    api
      .list({ category, q, page, page_size: PAGE_SIZE })
      .then((r) => !cancelled && setData(r))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [category, q, page]);

  function update(next: { category?: string; q?: string; page?: number }) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v === "" || v === undefined || (k === "page" && v === 1)) p.delete(k);
      else p.set(k, String(v));
    }
    setParams(p);
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="space-y-5">
      <form
        className="flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: search.trim(), page: 1 });
        }}
      >
        <select aria-label="Category" className={`${inputCls} sm:w-56`} value={category} onChange={(e) => update({ category: e.target.value, page: 1 })}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input aria-label="Search title" type="search" placeholder="Search by title" className={`${inputCls} flex-1 sm:min-w-64`} value={search} onChange={(e) => setSearch(e.target.value)} />
        <button type="submit" className={secondaryBtn}>
          Search
        </button>
      </form>

      {error && <ErrorBox message={error} />}
      {!data && !error && <p className="text-stone-500">Loading…</p>}
      {data && data.items.length === 0 && <p className="text-stone-600">No recipes found.</p>}
      {data && data.items.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((r) => (
            <li key={r.id} className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm hover:shadow">
              <Link to={`/recipes/${r.id}`} className="block space-y-2">
                <h2 className="text-lg font-semibold text-amber-900">{r.title}</h2>
                <p className="text-sm">
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">{r.category}</span>
                </p>
                <p className="text-sm text-stone-600">{r.prep_minutes} min prep</p>
                <p className="text-sm text-stone-500">by {r.author}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {data && data.total > 0 && (
        <nav className="flex items-center justify-between" aria-label="Pagination">
          <button type="button" className={secondaryBtn} disabled={page <= 1} onClick={() => update({ page: page - 1 })}>
            Previous
          </button>
          <span className="text-sm text-stone-600">
            Page {data.page} of {pages}
          </span>
          <button type="button" className={secondaryBtn} disabled={page >= pages} onClick={() => update({ page: page + 1 })}>
            Next
          </button>
        </nav>
      )}
    </div>
  );
}
