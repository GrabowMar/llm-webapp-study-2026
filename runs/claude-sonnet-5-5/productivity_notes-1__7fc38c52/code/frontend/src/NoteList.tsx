import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "./api";
import type { NoteList as NoteListData, TagCount } from "./api";
import { useAuth } from "./auth";
import { btn, btnGhost, card, chip, fmtDate, input } from "./ui";

const PAGE_SIZE = 10;

export default function NoteList() {
  const { username } = useAuth();
  const [params, setParams] = useSearchParams();
  const tag = params.get("tag") ?? "";
  const author = params.get("author") ?? "";
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);

  const [qInput, setQInput] = useState(q);
  const [authorInput, setAuthorInput] = useState(author);
  const [data, setData] = useState<NoteListData | null>(null);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [error, setError] = useState("");

  useEffect(() => setQInput(q), [q]);
  useEffect(() => setAuthorInput(author), [author]);

  useEffect(() => {
    let cancelled = false;
    const query = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
    if (tag) query.set("tag", tag);
    if (author) query.set("author", author);
    if (q) query.set("q", q);
    setError("");
    api<NoteListData>(`/notes?${query}`)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [tag, author, q, page]);

  useEffect(() => {
    api<{ items: TagCount[] }>("/tags")
      .then((d) => setTags(d.items))
      .catch(() => setTags([]));
  }, []);

  function update(changes: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    update({ q: qInput.trim(), author: authorInput.trim(), page: "" });
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const filtered = tag || author || q;

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_16rem]">
      <section className="space-y-4">
        <form onSubmit={submit} className="flex flex-wrap gap-2">
          <input
            aria-label="Search notes"
            placeholder="Search notes"
            className={`${input} flex-1 min-w-40`}
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
          />
          <input
            aria-label="Filter by author"
            placeholder="Author"
            className={`${input} w-36`}
            value={authorInput}
            onChange={(e) => setAuthorInput(e.target.value)}
          />
          <button className={btn}>Search</button>
          {filtered && (
            <button
              type="button"
              className={btnGhost}
              onClick={() => setParams(new URLSearchParams())}
            >
              Clear
            </button>
          )}
        </form>
        {tag && (
          <p className="text-sm text-slate-600">
            Tag: <span className={chip}>{tag}</span>
          </p>
        )}
        {error && (
          <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {!data && !error && <p className="text-slate-500">Loading…</p>}
        {data && data.items.length === 0 && <p className="text-slate-500">No notes found.</p>}
        <ul className="space-y-3">
          {data?.items.map((n) => (
            <li key={n.id} className={card}>
              <div className="flex items-start justify-between gap-2">
                <Link
                  to={`/notes/${n.id}`}
                  className="break-words text-lg font-semibold text-slate-900 hover:text-indigo-600"
                >
                  {n.pinned && (
                    <span
                      title="Pinned"
                      className="mr-2 rounded bg-amber-100 px-1.5 py-0.5 align-middle text-xs font-medium text-amber-800"
                    >
                      Pinned
                    </span>
                  )}
                  {n.title}
                </Link>
                {n.author === username && (
                  <span className="text-xs text-slate-400">yours</span>
                )}
              </div>
              <p className="mt-1 line-clamp-2 whitespace-pre-line break-words text-sm text-slate-600">
                {n.content}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>
                  by{" "}
                  <button
                    className="underline"
                    onClick={() => update({ author: n.author, page: "" })}
                  >
                    {n.author}
                  </button>
                </span>
                <span>{fmtDate(n.updated_at)}</span>
                {n.tags.map((t) => (
                  <button key={t} className={chip} onClick={() => update({ tag: t, page: "" })}>
                    {t}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
        {data && data.total > 0 && (
          <nav className="flex items-center justify-between" aria-label="Pagination">
            <button
              className={btnGhost}
              disabled={page <= 1}
              onClick={() => update({ page: page > 2 ? String(page - 1) : "" })}
            >
              Previous
            </button>
            <span className="text-sm text-slate-600">
              Page {page} of {pages} ({data.total} notes)
            </span>
            <button
              className={btnGhost}
              disabled={page >= pages}
              onClick={() => update({ page: String(page + 1) })}
            >
              Next
            </button>
          </nav>
        )}
      </section>
      <aside className={`${card} h-fit`}>
        <h2 className="mb-2 font-semibold">Tags</h2>
        {tags.length === 0 && <p className="text-sm text-slate-500">No tags yet.</p>}
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <button
              key={t.tag}
              onClick={() => update({ tag: t.tag === tag ? "" : t.tag, page: "" })}
              className={`${chip} ${t.tag === tag ? "ring-2 ring-indigo-500" : ""}`}
            >
              {t.tag} <span className="ml-1 text-indigo-400">{t.count}</span>
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}
