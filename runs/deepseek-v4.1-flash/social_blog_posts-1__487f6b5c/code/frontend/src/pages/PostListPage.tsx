import { useEffect, useMemo, useState } from "react";
import { request } from "../api";
import { useAuth } from "../auth";
import { useRouter } from "../router";
import type { Post, PostList } from "../types";
import {
  Alert,
  Button,
  Spinner,
  Tag,
  TextInput,
  formatDate,
} from "../components/ui";

const PAGE_SIZE = 8;

function useQuery() {
  const { search } = useRouter();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export function PostListPage() {
  const { navigate, search } = useRouter();
  const params = useQuery();
  const { user } = useAuth();

  const q = params.get("q") ?? "";
  const tag = params.get("tag") ?? "";
  const author = params.get("author") ?? "";
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);

  const [searchText, setSearchText] = useState(q);
  const [authorText, setAuthorText] = useState(author);
  const [tagText, setTagText] = useState(tag);
  const [data, setData] = useState<PostList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    setSearchText(q);
    setAuthorText(author);
    setTagText(tag);
  }, [q, author, tag]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (tag) query.set("tag", tag);
    if (author) query.set("author", author);
    query.set("page", String(page));
    query.set("page_size", String(PAGE_SIZE));
    request<PostList>(`/api/posts?${query.toString()}`)
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setError(err instanceof Error ? err.message : "Failed to load posts.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [q, tag, author, page, version]);

  function applyFilters(next: { q?: string; tag?: string; author?: string }) {
    const query = new URLSearchParams();
    const nextQ = next.q ?? q;
    const nextTag = next.tag ?? tag;
    const nextAuthor = next.author ?? author;
    if (nextQ) query.set("q", nextQ);
    if (nextTag) query.set("tag", nextTag);
    if (nextAuthor) query.set("author", nextAuthor);
    const suffix = query.toString();
    navigate(suffix ? `/?${suffix}` : "/");
  }

  function togglePost(post: Post) {
    request(`/api/admin/posts/${post.id}/toggle`, { method: "POST" })
      .then(() => setVersion((v) => v + 1))
      .catch((err) => setError(err instanceof Error ? err.message : "Action failed."));
  }

  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_16rem]">
      <div>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Latest posts</h1>
            <p className="mt-1 text-sm text-slate-500">
              {total} {total === 1 ? "post" : "posts"}
              {tag && ` tagged “${tag}”`}
              {author && ` by ${author}`}
              {q && ` matching “${q}”`}
            </p>
          </div>
          {user && <Button onClick={() => navigate("/new")}>Write a post</Button>}
        </div>

        <form
          className="mb-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            applyFilters({ q: searchText.trim() });
          }}
        >
          <TextInput
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search title and content…"
            aria-label="Search posts"
          />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>

        {error && (
          <div className="mb-4">
            <Alert>{error}</Alert>
          </div>
        )}

        {loading ? (
          <Spinner />
        ) : !data || data.items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
            No posts found.
          </div>
        ) : (
          <ul className="space-y-4">
            {data.items.map((post) => (
              <li
                key={post.id}
                className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="text-lg font-semibold">
                    <button
                      className="text-left hover:underline"
                      onClick={() => navigate(`/posts/${post.id}`)}
                    >
                      {post.title}
                    </button>
                  </h2>
                  {user?.is_admin && (
                    <Button
                      variant="danger"
                      className="text-xs"
                      onClick={() => togglePost(post)}
                    >
                      {post.taken_down ? "Restore" : "Take down"}
                    </Button>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  by{" "}
                  <button
                    className="font-medium text-slate-700 hover:underline"
                    onClick={() => applyFilters({ author: post.author })}
                  >
                    {post.author}
                  </button>{" "}
                  · {formatDate(post.created_at)}
                  {post.taken_down && (
                    <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-red-700">
                      taken down
                    </span>
                  )}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  {post.excerpt}
                </p>
                {post.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {post.tags.map((t) => (
                      <button key={t} onClick={() => applyFilters({ tag: t })}>
                        <Tag>{t}</Tag>
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {pageCount > 1 && (
          <div className="mt-6 flex items-center justify-between">
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => {
                const query = new URLSearchParams(search);
                query.set("page", String(page - 1));
                navigate(`/?${query.toString()}`);
              }}
            >
              Previous
            </Button>
            <span className="text-sm text-slate-500">
              Page {page} of {pageCount}
            </span>
            <Button
              variant="secondary"
              disabled={page >= pageCount}
              onClick={() => {
                const query = new URLSearchParams(search);
                query.set("page", String(page + 1));
                navigate(`/?${query.toString()}`);
              }}
            >
              Next
            </Button>
          </div>
        )}
      </div>

      <aside className="space-y-5">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Filter by tag
          </h2>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              applyFilters({ tag: tagText.trim() });
            }}
          >
            <TextInput
              value={tagText}
              onChange={(e) => setTagText(e.target.value)}
              placeholder="tag"
              aria-label="Filter by tag"
            />
            <Button type="submit" variant="secondary">
              Go
            </Button>
          </form>
          {tag && (
            <div className="mt-3 flex items-center gap-2">
              <Tag>{tag}</Tag>
              <button
                className="text-xs text-slate-500 underline"
                onClick={() => applyFilters({ tag: "" })}
              >
                remove
              </button>
            </div>
          )}
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Filter by author
          </h2>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              applyFilters({ author: authorText.trim() });
            }}
          >
            <TextInput
              value={authorText}
              onChange={(e) => setAuthorText(e.target.value)}
              placeholder="username"
              aria-label="Filter by author"
            />
            <Button type="submit" variant="secondary">
              Go
            </Button>
          </form>
        </div>
        {(tag || author || q) && (
          <button
            className="text-sm font-medium text-slate-500 underline"
            onClick={() => navigate("/")}
          >
            Clear all filters
          </button>
        )}
      </aside>
    </div>
  );
}
