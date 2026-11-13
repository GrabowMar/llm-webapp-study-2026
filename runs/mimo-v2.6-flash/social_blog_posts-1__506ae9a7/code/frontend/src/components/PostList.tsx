import { FormEvent, useEffect, useRef, useState } from "react";
import { ApiError, Post, PostListResponse, fetchPosts, togglePost } from "../api";
import { formatDate } from "../format";

export type ListFilters = {
  q: string;
  tag: string;
  author: string;
  page: number;
};

type Props = {
  filters: ListFilters;
  onFiltersChange: (filters: ListFilters) => void;
  username: string | null;
};

const PAGE_SIZE = 10;

export default function PostList({ filters, onFiltersChange, username }: Props) {
  const isAdmin = username === "admin";
  const [qInput, setQInput] = useState(filters.q);
  const [tagInput, setTagInput] = useState(filters.tag);
  const [authorInput, setAuthorInput] = useState(filters.author);
  const [data, setData] = useState<PostListResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const requestSeq = useRef(0);

  useEffect(() => setQInput(filters.q), [filters.q]);
  useEffect(() => setTagInput(filters.tag), [filters.tag]);
  useEffect(() => setAuthorInput(filters.author), [filters.author]);

  const pendingChange =
    qInput !== filters.q || tagInput !== filters.tag || authorInput !== filters.author;

  useEffect(() => {
    if (!pendingChange) return;
    const timer = window.setTimeout(() => {
      onFiltersChange({ q: qInput, tag: tagInput, author: authorInput, page: 1 });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [qInput, tagInput, authorInput, pendingChange, onFiltersChange]);

  useEffect(() => {
    const seq = ++requestSeq.current;
    setLoading(true);
    fetchPosts({
      q: filters.q || undefined,
      tag: filters.tag || undefined,
      author: filters.author || undefined,
      page: filters.page,
      page_size: PAGE_SIZE,
      include_taken_down: isAdmin,
    })
      .then((result) => {
        if (seq !== requestSeq.current) return;
        setData(result);
        setError("");
      })
      .catch((err: unknown) => {
        if (seq !== requestSeq.current) return;
        setError(err instanceof ApiError ? err.message : "Failed to load posts");
      })
      .finally(() => {
        if (seq === requestSeq.current) setLoading(false);
      });
  }, [filters.q, filters.tag, filters.author, filters.page, reload, isAdmin]);

  function applyFilters(patch: Partial<ListFilters>) {
    const touchesQuery =
      patch.q !== undefined || patch.tag !== undefined || patch.author !== undefined;
    onFiltersChange({
      ...filters,
      ...patch,
      page: patch.page ?? (touchesQuery ? 1 : filters.page),
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    onFiltersChange({
      q: qInput,
      tag: tagInput,
      author: authorInput,
      page: 1,
    });
    setReload((count) => count + 1);
  }

  async function handleToggle(post: Post) {
    try {
      await togglePost(post.id);
      setReload((count) => count + 1);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : "Failed to update post");
    }
  }

  const total = data?.total ?? 0;
  const page = filters.page;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Posts</h1>

      <form
        onSubmit={submit}
        className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="mb-1 block text-xs font-semibold uppercase text-gray-500">
              Search
            </span>
            <input
              type="search"
              value={qInput}
              onChange={(event) => setQInput(event.target.value)}
              placeholder="Search title and content"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </label>
          <label className="sm:w-36">
            <span className="mb-1 block text-xs font-semibold uppercase text-gray-500">Tag</span>
            <input
              type="text"
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              placeholder="python"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </label>
          <label className="sm:w-36">
            <span className="mb-1 block text-xs font-semibold uppercase text-gray-500">
              Author
            </span>
            <input
              type="text"
              value={authorInput}
              onChange={(event) => setAuthorInput(event.target.value)}
              placeholder="alice"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Search
          </button>
        </div>
        {(filters.q || filters.tag || filters.author) && (
          <div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
            <span>
              Filtering by{" "}
              {[
                filters.q && `search “${filters.q}”`,
                filters.tag && `tag “${filters.tag}”`,
                filters.author && `author “${filters.author}”`,
              ]
                .filter(Boolean)
                .join(", ")}
            </span>
            <button
              type="button"
              onClick={() =>
                onFiltersChange({ q: "", tag: "", author: "", page: 1 })
              }
              className="font-medium text-indigo-600 hover:underline"
            >
              Clear
            </button>
          </div>
        )}
      </form>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && !data && <p className="text-gray-500">Loading posts…</p>}

      <ul className="space-y-4">
        {data?.items.map((post) => (
          <li
            key={post.id}
            className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <a
                  href={`#/post/${post.id}`}
                  className="text-lg font-semibold text-gray-900 hover:text-indigo-600"
                >
                  {post.title}
                </a>
                <p className="mt-1 text-sm text-gray-500">
                  by{" "}
                  <button
                    type="button"
                    onClick={() => applyFilters({ author: post.author })}
                    className="font-medium text-gray-700 hover:text-indigo-600 hover:underline"
                  >
                    {post.author}
                  </button>{" "}
                  · <time dateTime={post.created_at}>{formatDate(post.created_at)}</time>
                </p>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => handleToggle(post)}
                  className={
                    post.taken_down
                      ? "rounded-md border border-green-300 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-100"
                      : "rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
                  }
                >
                  {post.taken_down ? "Restore" : "Take down"}
                </button>
              )}
            </div>
            {post.taken_down && (
              <span className="mt-2 inline-block rounded bg-red-100 px-2 py-0.5 text-xs font-semibold uppercase text-red-700">
                Taken down
              </span>
            )}
            <p className="mt-3 whitespace-pre-line text-sm text-gray-600">{post.excerpt}</p>
            {post.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => applyFilters({ tag })}
                    className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>

      {data && data.items.length === 0 && !error && (
        <p className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
          No posts found.
        </p>
      )}

      {data && total > 0 && (
        <nav className="mt-6 flex items-center justify-between text-sm text-gray-600">
          <span>
            {total} post{total === 1 ? "" : "s"}
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => applyFilters({ page: page - 1 })}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 font-medium disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <span>
              Page {page} of {pageCount}
            </span>
            <button
              type="button"
              disabled={page >= pageCount}
              onClick={() => applyFilters({ page: page + 1 })}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 font-medium disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
