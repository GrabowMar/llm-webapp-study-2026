import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import type { Post } from "../types";
import { ErrorBanner, TagPill, formatDate, inputClass } from "./ui";

const PAGE_SIZE = 10;

export function PostList({
  onOpenPost,
  onNavigate,
}: {
  onOpenPost: (id: number) => void;
  onNavigate: (to: string) => void;
}) {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [author, setAuthor] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(() => {
    setLoading(true);
    api
      .listPosts({ q, tag, author, page, page_size: PAGE_SIZE })
      .then((data) => {
        setPosts(data.items);
        setTotal(data.total);
        setPages(Math.max(1, Math.ceil(data.total / data.page_size)));
        setError("");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load posts"))
      .finally(() => setLoading(false));
  }, [q, tag, author, page]);

  useEffect(load, [load]);

  const [tookDown, setTookDown] = useState<Post | null>(null);

  const toggleAdmin = async (post: Post) => {
    try {
      const updated = await api.togglePost(post.id);
      if (updated.taken_down) {
        setPosts((prev) => prev.filter((p) => p.id !== post.id));
        setTotal((t) => Math.max(0, t - 1));
        setTookDown(updated);
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update post");
    }
  };

  const restore = async () => {
    if (!tookDown) return;
    try {
      await api.togglePost(tookDown.id);
      setTookDown(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore post");
    }
  };

  const clearFilters = () => {
    setSearchInput("");
    setQ("");
    setTag("");
    setAuthor("");
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search posts…"
            className={`${inputClass} flex-1`}
            aria-label="Search posts"
          />
          <div className="flex gap-3">
            <input
              value={tag}
              onChange={(e) => {
                setTag(e.target.value.trim());
                setPage(1);
              }}
              placeholder="Filter by tag"
              className={`${inputClass} sm:w-36`}
              aria-label="Filter by tag"
            />
            <input
              value={author}
              onChange={(e) => {
                setAuthor(e.target.value.trim());
                setPage(1);
              }}
              placeholder="Filter by author"
              className={`${inputClass} sm:w-36`}
              aria-label="Filter by author"
            />
          </div>
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Clear
          </button>
        </div>
        <p className="text-xs text-slate-500">
          {loading ? "Loading…" : `${total} post${total === 1 ? "" : "s"}`}
        </p>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError("")} />}

      {user?.is_admin && (
        <p className="rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Signed in as admin — you can take posts down from the list below.
        </p>
      )}

      <ul className="space-y-3">
        {posts.map((post) => (
          <li
            key={post.id}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow"
          >
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                onClick={() => onOpenPost(post.id)}
                className="text-left"
              >
                <h2 className="text-base font-semibold text-slate-900 hover:text-emerald-700">
                  {post.title}
                </h2>
              </button>
      {tookDown && (
        <div className="flex items-center justify-between gap-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>
            “{tookDown.title}” was taken down and hidden from the list.
          </span>
          <button
            type="button"
            onClick={restore}
            className="shrink-0 rounded-md bg-amber-600 px-3 py-1 font-medium text-white hover:bg-amber-700"
          >
            Undo
          </button>
        </div>
      )}

      {user?.is_admin && (
                <button
                  type="button"
                  onClick={() => toggleAdmin(post)}
                  className="shrink-0 rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                  title="Take this post down"
                >
                  Take down
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              by{" "}
              <button
                type="button"
                onClick={() => {
                  setAuthor(post.author);
                  setPage(1);
                }}
                className="font-medium text-emerald-700 hover:underline"
              >
                {post.author}
              </button>{" "}
              · {formatDate(post.created_at)}
            </p>
            <button
              type="button"
              onClick={() => onOpenPost(post.id)}
              className="mt-2 block w-full text-left text-sm text-slate-600"
            >
              {post.excerpt}
              {post.content.length > post.excerpt.length && "…"}
            </button>
            {post.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {post.tags.map((t) => (
                  <TagPill
                    key={t}
                    tag={t}
                    active={tag.toLowerCase() === t.toLowerCase()}
                    onClick={() => {
                      setTag(t);
                      setPage(1);
                    }}
                  />
                ))}
              </div>
            )}
          </li>
        ))}
        {!loading && posts.length === 0 && (
          <li className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            No posts found.
            {!user && (
              <>
                {" "}
                <button
                  type="button"
                  onClick={() => onNavigate("/new")}
                  className="font-medium text-emerald-700 hover:underline"
                >
                  Sign in
                </button>{" "}
                to write the first one.
              </>
            )}
          </li>
        )}
      </ul>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            ← Previous
          </button>
          <span className="text-slate-500">
            Page {page} of {pages}
          </span>
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
