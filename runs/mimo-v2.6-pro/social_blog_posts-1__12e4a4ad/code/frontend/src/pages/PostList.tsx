import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { api, formatDate } from "../api";
import type { Auth, PostListData } from "../api";
import { Link } from "../router";

const PAGE_SIZE = 10;

function parseSearch(search: string) {
  const params = new URLSearchParams(search);
  return {
    q: params.get("q") ?? "",
    tag: params.get("tag") ?? "",
    author: params.get("author") ?? "",
    page: Math.max(1, Number(params.get("page") ?? "1") || 1),
  };
}

export default function PostList({ auth, search }: { auth: Auth | null; search: string }) {
  const initial = parseSearch(search);
  const [q, setQ] = useState(initial.q);
  const [tag, setTag] = useState(initial.tag);
  const [author, setAuthor] = useState(initial.author);
  const [filters, setFilters] = useState(initial);
  const [data, setData] = useState<PostListData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const isAdmin = auth?.username === "admin";

  const prevSearch = useRef(search);
  useEffect(() => {
    if (prevSearch.current === search) return;
    prevSearch.current = search;
    const next = parseSearch(search);
    setQ(next.q);
    setTag(next.tag);
    setAuthor(next.author);
    setFilters(next);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.tag) params.set("tag", filters.tag);
    if (filters.author) params.set("author", filters.author);
    params.set("page", String(filters.page));
    params.set("page_size", String(PAGE_SIZE));
    api<PostListData>(`/api/posts?${params.toString()}`, { token: auth?.token ?? null })
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setData(null);
        setError(err instanceof Error ? err.message : "Failed to load posts");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, auth, refreshKey]);

  const applyFilters = (next: { q: string; tag: string; author: string }) => {
    setQ(next.q);
    setTag(next.tag);
    setAuthor(next.author);
    setFilters({ ...next, page: 1 });
  };

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    applyFilters({ q, tag, author });
  };

  const togglePost = useCallback(
    async (postId: number) => {
      if (!auth) return;
      try {
        await api(`/api/admin/posts/${postId}/toggle`, { method: "POST", token: auth.token });
        setRefreshKey((key) => key + 1);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to toggle post");
      }
    },
    [auth],
  );

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">All posts</h1>

      <form
        onSubmit={onSearch}
        className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search posts…"
            aria-label="Search posts"
            className="flex-1 rounded border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
          />
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="Filter by tag"
            aria-label="Filter by tag"
            className="rounded border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none sm:w-40"
          />
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Filter by author"
            aria-label="Filter by author"
            className="rounded border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none sm:w-44"
          />
          <button
            type="submit"
            className="rounded bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
          >
            Search
          </button>
        </div>
      </form>

      {error && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && !data && <p className="mt-6 text-slate-600">Loading posts…</p>}

      {data && data.items.length === 0 && !error && (
        <p className="mt-6 text-slate-600">No posts found.</p>
      )}

      <div className={`mt-6 space-y-4 ${loading ? "opacity-60" : ""}`}>
        {data?.items.map((post) => (
          <article
            key={post.id}
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h2 className="text-xl font-semibold">
              <Link to={`/posts/${post.id}`} className="text-indigo-700 hover:underline">
                {post.title}
              </Link>
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              by{" "}
              <button
                type="button"
                onClick={() => applyFilters({ q, tag, author: post.author })}
                className="font-medium text-slate-700 hover:underline"
              >
                {post.author}
              </button>
              {" · "}
              {formatDate(post.created_at)}
            </p>
            <p className="mt-2 text-slate-700">{post.excerpt}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {post.tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => applyFilters({ q, tag: t, author })}
                  className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
                >
                  #{t}
                </button>
              ))}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => togglePost(post.id)}
                  className="ml-auto rounded border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                >
                  Take down / restore
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      {data && data.total > 0 && (
        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={filters.page <= 1}
            onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
            className="rounded border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-slate-600">
            Page {data.page} of {totalPages} · {data.total} post{data.total === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            disabled={filters.page >= totalPages}
            onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
            className="rounded border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
