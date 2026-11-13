import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type Post, type PostPage } from "../api";
import { useAuth } from "../auth";
import { Link, navigate } from "../router";
import { Alert, btnPrimary, btnSecondary, formatDate, inputCls, TagChip } from "../ui";
import TakeDownButton from "./TakeDownButton";

const PAGE_SIZE = 10;

function buildUrl(params: Record<string, string | number | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && !(k === "page" && v === 1)) sp.set(k, String(v));
  }
  const qs = sp.toString();
  return qs ? `/?${qs}` : "/";
}

export default function PostList({ search }: { search: string }) {
  const { user } = useAuth();
  const sp = new URLSearchParams(search);
  const q = sp.get("q") ?? "";
  const tag = sp.get("tag") ?? "";
  const author = sp.get("author") ?? "";
  const hidden = sp.get("hidden") === "1";
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const showHidden = hidden && !!user?.is_admin;

  const [data, setData] = useState<PostPage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [qInput, setQInput] = useState(q);
  const [tagInput, setTagInput] = useState(tag);
  const [authorInput, setAuthorInput] = useState(author);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setQInput(q);
    setTagInput(tag);
    setAuthorInput(author);
  }, [q, tag, author]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .listPosts({ q, tag, author, page, page_size: PAGE_SIZE, include_taken_down: showHidden })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load posts.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q, tag, author, page, showHidden, reload]);

  const go = (over: Record<string, string | number | undefined>) =>
    navigate(buildUrl({ q, tag, author, hidden: hidden ? "1" : undefined, page, ...over }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    go({ q: qInput.trim(), tag: tagInput.trim(), author: authorInput.trim(), page: 1 });
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const filtered = q || tag || author;

  const onToggled = (p: Post) => {
    if (!showHidden && p.taken_down) setReload((n) => n + 1);
    else setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === p.id ? { ...x, ...p } : x)) } : d));
  };

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[2fr_1fr_1fr_auto]" role="search">
        <div>
          <label htmlFor="q" className="sr-only">
            Search
          </label>
          <input id="q" type="search" placeholder="Search posts…" className={inputCls} value={qInput} onChange={(e) => setQInput(e.target.value)} />
        </div>
        <div>
          <label htmlFor="tag-filter" className="sr-only">
            Tag
          </label>
          <input id="tag-filter" placeholder="Tag" className={inputCls} value={tagInput} onChange={(e) => setTagInput(e.target.value)} />
        </div>
        <div>
          <label htmlFor="author-filter" className="sr-only">
            Author
          </label>
          <input id="author-filter" placeholder="Author" className={inputCls} value={authorInput} onChange={(e) => setAuthorInput(e.target.value)} />
        </div>
        <button type="submit" className={btnPrimary}>
          Search
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
        {filtered && (
          <>
            <span>Filtered by:</span>
            {q && <span className="rounded bg-slate-100 px-2 py-0.5">“{q}”</span>}
            {tag && <span className="rounded bg-indigo-50 px-2 py-0.5 text-indigo-700">#{tag}</span>}
            {author && <span className="rounded bg-slate-100 px-2 py-0.5">by {author}</span>}
            <Link href={buildUrl({ hidden: hidden ? "1" : undefined })} className="text-indigo-600 hover:underline">
              Clear
            </Link>
          </>
        )}
        {user?.is_admin && (
          <label className="ml-auto inline-flex items-center gap-2">
            <input type="checkbox" checked={hidden} onChange={(e) => go({ hidden: e.target.checked ? "1" : undefined, page: 1 })} />
            Show taken-down posts
          </label>
        )}
      </div>

      {error && <Alert>{error}</Alert>}
      {loading && !data && <p className="text-slate-500">Loading…</p>}

      {data && data.items.length === 0 && !loading && (
        <Alert kind="info">{filtered ? "No posts match your filters." : "No posts yet."}</Alert>
      )}

      <ul className={`space-y-4 ${loading ? "opacity-60" : ""}`}>
        {data?.items.map((p) => (
          <li key={p.id} className={`rounded-lg border bg-white p-5 shadow-sm ${p.taken_down ? "border-amber-300" : "border-slate-200"}`}>
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold text-slate-900">
                <Link href={`/posts/${p.id}`} className="hover:text-indigo-700">
                  {p.title}
                </Link>
              </h2>
              {user?.is_admin && <TakeDownButton post={p} onDone={onToggled} />}
            </div>
            <p className="mt-1 text-sm text-slate-500">
              by{" "}
              <Link href={buildUrl({ author: p.author })} className="font-medium text-slate-700 hover:underline">
                {p.author}
              </Link>{" "}
              · <time dateTime={p.created_at}>{formatDate(p.created_at)}</time>
              {p.taken_down && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">Taken down</span>}
            </p>
            <p className="mt-3 break-words text-slate-700">
              {p.excerpt}
              {p.content.length > p.excerpt.length && "…"}
            </p>
            {p.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {p.tags.map((t) => (
                  <TagChip key={t} tag={t} />
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>

      {data && data.total > 0 && (
        <nav className="flex items-center justify-between" aria-label="Pagination">
          <button type="button" className={btnSecondary} disabled={page <= 1} onClick={() => go({ page: page - 1 })}>
            ← Newer
          </button>
          <span className="text-sm text-slate-600">
            Page {page} of {totalPages} · {data.total} post{data.total === 1 ? "" : "s"}
          </span>
          <button type="button" className={btnSecondary} disabled={page >= totalPages} onClick={() => go({ page: page + 1 })}>
            Older →
          </button>
        </nav>
      )}
    </div>
  );
}
