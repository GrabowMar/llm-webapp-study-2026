import { useCallback, useEffect, useState } from "react";
import { api, formatDate, type Post } from "../api";
import { Link } from "../router";

export default function PostList() {
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [author, setAuthor] = useState("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<{
    items: Post[];
    total: number;
    page: number;
    page_size: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listPosts({ q, tag, author, page });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load posts");
    } finally {
      setLoading(false);
    }
  }, [q, tag, author, page]);

  useEffect(() => {
    load();
  }, [load]);

  const pageSize = data?.page_size ?? 10;
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  function goTo(p: number) {
    setPage(p);
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 space-y-3">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Search posts…"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <div className="flex flex-wrap gap-3">
          <input
            value={tag}
            onChange={(e) => {
              setTag(e.target.value);
              setPage(1);
            }}
            placeholder="Filter by tag"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <input
            value={author}
            onChange={(e) => {
              setAuthor(e.target.value);
              setPage(1);
            }}
            placeholder="Filter by author"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {loading && <p className="py-8 text-sm text-slate-500">Loading…</p>}
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {!loading && !error && data && data.items.length === 0 && (
        <p className="py-8 text-sm text-slate-500">No posts found.</p>
      )}

      <ul className="space-y-4">
        {data?.items.map((post) => (
          <li key={post.id}>
            <Link
              to={`/posts/${post.id}`}
              className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-indigo-300 hover:shadow-sm"
            >
              <h2 className="text-lg font-semibold text-slate-900">
                {post.title}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {post.author} · {formatDate(post.created_at)}
              </p>
              <p className="mt-2 text-sm text-slate-600">{post.excerpt}</p>
              {post.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {post.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>

      {pages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => goTo(page - 1)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-slate-600">
            Page {page} of {pages}
          </span>
          <button
            disabled={page >= pages}
            onClick={() => goTo(page + 1)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
