import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import Layout from "../components/Layout";
import Notice from "../components/Notice";
import Pagination from "../components/Pagination";
import PostCard from "../components/PostCard";
import type { Post, PostPage } from "../types";

const PAGE_SIZE = 10;

export default function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  const query = searchParams.get("q") ?? "";
  const tag = searchParams.get("tag") ?? "";
  const author = searchParams.get("author") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);

  const [searchText, setSearchText] = useState(query);
  const [result, setResult] = useState<PostPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [authors, setAuthors] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    setSearchText(query);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listPosts({ q: query, tag, author, page, page_size: PAGE_SIZE });
      setResult(data);
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not load posts.");
    } finally {
      setLoading(false);
    }
  }, [query, tag, author, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api.tags().then((data) => setTags(data.items)).catch(() => undefined);
    api.authors().then((data) => setAuthors(data.items)).catch(() => undefined);
  }, []);

  const updateParams = (changes: Record<string, string>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([key, value]) => {
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
    });
    next.delete("page");
    setSearchParams(next);
  };

  const handleToggle = async (post: Post) => {
    const takingDown = window.confirm(`Take down "${post.title}"? Readers will no longer see it.`);
    if (!takingDown) return;
    setBusyId(post.id);
    try {
      await api.togglePost(post.id);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not update the post.");
    } finally {
      setBusyId(null);
    }
  };

  const items = result?.items ?? [];
  const hasFilters = Boolean(query || tag || author);

  return (
    <Layout>
      <div className="space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Latest posts</h1>
          <p className="mt-1 text-sm text-slate-500">
            Stories from the Inkwell community. Anyone can read; signed-in authors can write.
          </p>

          <form
            className="mt-4 flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              updateParams({ q: searchText.trim() });
            }}
          >
            <label className="sr-only" htmlFor="search">
              Search posts
            </label>
            <input
              id="search"
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search titles and text…"
              className="min-w-[12rem] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
            >
              Search
            </button>
          </form>

          <div className="mt-3 flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="tag-filter" className="text-sm text-slate-500">
                Tag
              </label>
              <select
                id="tag-filter"
                value={tag}
                onChange={(event) => updateParams({ tag: event.target.value })}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              >
                <option value="">All tags</option>
                {tags.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="author-filter" className="text-sm text-slate-500">
                Author
              </label>
              <select
                id="author-filter"
                value={author}
                onChange={(event) => updateParams({ author: event.target.value })}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              >
                <option value="">All authors</option>
                {authors.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            {hasFilters ? (
              <button
                type="button"
                onClick={() => setSearchParams(new URLSearchParams())}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
              >
                Clear filters
              </button>
            ) : null}
          </div>
        </section>

        {error ? <Notice tone="error">{error}</Notice> : null}

        {loading ? (
          <p className="py-10 text-center text-sm text-slate-500">Loading posts…</p>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="text-sm text-slate-600">
              {hasFilters ? "No posts match these filters." : "No posts have been published yet."}
            </p>
            {!hasFilters ? (
              <Link
                to={user ? "/new" : "/login"}
                className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
              >
                {user ? "Write the first post" : "Sign in to write"}
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onTagClick={(name) => updateParams({ tag: name })}
                actions={
                  user?.is_admin ? (
                    <button
                      type="button"
                      disabled={busyId === post.id}
                      onClick={() => handleToggle(post)}
                      className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
                    >
                      {busyId === post.id ? "Working…" : "Take down"}
                    </button>
                  ) : undefined
                }
              />
            ))}
          </div>
        )}

        {result ? (
          <Pagination
            page={result.page}
            pageSize={result.page_size}
            total={result.total}
            onChange={(nextPage) => {
              const next = new URLSearchParams(searchParams);
              next.set("page", String(nextPage));
              setSearchParams(next);
            }}
          />
        ) : null}
      </div>
    </Layout>
  );
}
