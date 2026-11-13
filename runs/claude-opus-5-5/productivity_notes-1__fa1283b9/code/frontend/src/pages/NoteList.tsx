import { useEffect, useState, type FormEvent } from "react";
import { api, type NotePage, type TagCount } from "../api";
import { useAuth } from "../auth";
import { Alert, PinBadge, TagChip, btnPrimary, btnSecondary, formatDate, inputCls } from "../components/ui";
import { Link, navigate } from "../router";

const PAGE_SIZE = 10;

function buildSearch(params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && !(k === "page" && Number(v) === 1)) qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `/?${s}` : "/";
}

export default function NoteList({ search }: { search: string }) {
  const { username } = useAuth();
  const params = new URLSearchParams(search);
  const q = params.get("q") ?? "";
  const author = params.get("author") ?? "";
  const tag = params.get("tag") ?? "";
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);

  const [qDraft, setQDraft] = useState(q);
  const [authorDraft, setAuthorDraft] = useState(author);
  const [data, setData] = useState<NotePage | null>(null);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setQDraft(q);
    setAuthorDraft(author);
  }, [q, author]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .listNotes({ q, author, tag, page, page_size: PAGE_SIZE })
      .then((res) => !cancelled && setData(res))
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [q, author, tag, page]);

  useEffect(() => {
    api
      .tags()
      .then((res) => setTags(res.items))
      .catch(() => setTags([]));
  }, []);

  const go = (next: Partial<{ q: string; author: string; tag: string; page: number }>) =>
    navigate(buildSearch({ q, author, tag, page: 1, ...next }));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    go({ q: qDraft.trim(), author: authorDraft.trim() });
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const maxCount = tags.reduce((m, t) => Math.max(m, t.count), 1);
  const hasFilters = q || author || tag;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_16rem]">
      <section className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-slate-900">Notes</h1>
          {username && (
            <Link to="/notes/new" className={btnPrimary}>
              New note
            </Link>
          )}
        </div>

        <form onSubmit={onSubmit} className="mb-4 grid gap-2 sm:grid-cols-[1fr_12rem_auto]" role="search">
          <label className="sr-only" htmlFor="search-q">
            Search
          </label>
          <input
            id="search-q"
            type="search"
            className={inputCls}
            placeholder="Search notes…"
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
          />
          <label className="sr-only" htmlFor="search-author">
            Author
          </label>
          <input
            id="search-author"
            type="text"
            className={inputCls}
            placeholder="Author"
            value={authorDraft}
            onChange={(e) => setAuthorDraft(e.target.value)}
          />
          <button type="submit" className={btnSecondary}>
            Search
          </button>
        </form>

        {hasFilters && (
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span>Filtered by:</span>
            {q && <span className="rounded bg-slate-100 px-2 py-0.5">“{q}”</span>}
            {author && (
              <span className="rounded bg-slate-100 px-2 py-0.5">
                author: <strong>{author}</strong>
              </span>
            )}
            {tag && <TagChip tag={tag} active onClick={() => go({ tag: "" })} />}
            <button
              type="button"
              className="text-indigo-600 hover:underline"
              onClick={() => navigate("/")}
            >
              Clear filters
            </button>
          </div>
        )}

        {error && <Alert>{error}</Alert>}

        {loading && !data ? (
          <p className="text-slate-500">Loading…</p>
        ) : data && data.items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
            No notes found.
          </div>
        ) : (
          <ul className={`space-y-3 ${loading ? "opacity-60" : ""}`}>
            {data?.items.map((note) => (
              <li
                key={note.id}
                className={`rounded-lg border bg-white p-4 shadow-sm transition hover:shadow ${
                  note.pinned ? "border-amber-300 ring-1 ring-amber-200" : "border-slate-200"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link
                    to={`/notes/${note.id}`}
                    className="text-lg font-semibold break-words text-slate-900 hover:text-indigo-600"
                  >
                    {note.title}
                  </Link>
                  {note.pinned && <PinBadge />}
                </div>
                {note.content && (
                  <p className="mt-1 line-clamp-2 text-sm break-words whitespace-pre-line text-slate-600">
                    {note.content}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-500">
                  <button
                    type="button"
                    className="font-medium text-slate-700 hover:text-indigo-600"
                    onClick={() => go({ author: note.author })}
                  >
                    {note.author}
                  </button>
                  <span>Updated {formatDate(note.updated_at)}</span>
                  {note.tags.length > 0 && (
                    <span className="flex flex-wrap gap-1">
                      {note.tags.map((t) => (
                        <TagChip key={t} tag={t} active={t === tag} onClick={() => go({ tag: t })} />
                      ))}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {data && data.total > 0 && (
          <nav className="mt-6 flex items-center justify-between gap-2" aria-label="Pagination">
            <button
              type="button"
              className={btnSecondary}
              disabled={page <= 1}
              onClick={() => go({ page: page - 1 })}
            >
              Previous
            </button>
            <span className="text-sm text-slate-600">
              Page {page} of {totalPages} · {data.total} note{data.total === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              className={btnSecondary}
              disabled={page >= totalPages}
              onClick={() => go({ page: page + 1 })}
            >
              Next
            </button>
          </nav>
        )}
      </section>

      <aside>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">Tags</h2>
        {tags.length === 0 ? (
          <p className="text-sm text-slate-500">No tags yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-4">
            {tags.map((t) => {
              const weight = t.count / maxCount;
              const size = weight > 0.75 ? "text-lg" : weight > 0.5 ? "text-base" : weight > 0.25 ? "text-sm" : "text-xs";
              const active = t.tag === tag;
              return (
                <button
                  key={t.tag}
                  type="button"
                  onClick={() => go({ tag: active ? "" : t.tag })}
                  aria-pressed={active}
                  className={`rounded px-1.5 py-0.5 ${size} ${
                    active ? "bg-indigo-600 text-white" : "text-indigo-700 hover:bg-indigo-50"
                  }`}
                  title={`${t.count} note${t.count === 1 ? "" : "s"}`}
                >
                  #{t.tag}
                  <span className={`ml-1 text-xs ${active ? "text-indigo-100" : "text-slate-400"}`}>{t.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </aside>
    </div>
  );
}
