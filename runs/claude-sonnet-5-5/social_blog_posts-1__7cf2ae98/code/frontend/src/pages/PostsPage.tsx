import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError, api, type PostList } from "../api";
import { useAuth } from "../auth";
import { Button, ErrorBox, TagList, fmtDate, inputCls } from "../ui";

export default function PostsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const tag = params.get("tag") || "";
  const author = params.get("author") || "";
  const down = params.get("taken_down") === "1" && !!user?.is_admin;
  const page = Math.max(1, parseInt(params.get("page") || "1", 10) || 1);

  const [data, setData] = useState<PostList | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ q, tag, author });
  const [reload, setReload] = useState(0);

  useEffect(() => setForm({ q, tag, author }), [q, tag, author]);

  useEffect(() => {
    let live = true;
    setError("");
    api
      .listPosts({ q, tag, author, page, taken_down: down ? 1 : undefined })
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e instanceof ApiError ? e.message : "Failed to load posts"));
    return () => {
      live = false;
    };
  }, [q, tag, author, page, down, reload, user?.username]);

  function update(next: Record<string, string>) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p);
  }

  function search(e: FormEvent) {
    e.preventDefault();
    update({ q: form.q.trim(), tag: form.tag.trim(), author: form.author.trim(), page: "" });
  }

  async function toggle(id: number) {
    try {
      await api.toggle(id);
      setReload((n) => n + 1);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action failed");
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="space-y-4">
      <form onSubmit={search} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
        <input
          className={inputCls}
          type="search"
          placeholder="Search posts"
          aria-label="Search"
          value={form.q}
          onChange={(e) => setForm({ ...form, q: e.target.value })}
        />
        <input
          className={inputCls}
          placeholder="Tag"
          aria-label="Tag filter"
          value={form.tag}
          onChange={(e) => setForm({ ...form, tag: e.target.value })}
        />
        <input
          className={inputCls}
          placeholder="Author"
          aria-label="Author filter"
          value={form.author}
          onChange={(e) => setForm({ ...form, author: e.target.value })}
        />
        <Button type="submit">Search</Button>
      </form>

      {user?.is_admin && (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={down}
            onChange={(e) => update({ taken_down: e.target.checked ? "1" : "", page: "" })}
          />
          Show taken-down posts
        </label>
      )}

      {error && <ErrorBox>{error}</ErrorBox>}
      {!data && !error && <p className="text-slate-500">Loading…</p>}
      {data && data.items.length === 0 && <p className="text-slate-500">No posts found.</p>}

      <ul className="space-y-3">
        {data?.items.map((p) => (
          <li key={p.id} className="rounded bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">
              <Link to={`/posts/${p.id}`} className="hover:text-indigo-700">
                {p.title}
              </Link>
            </h2>
            <p className="mb-2 text-xs text-slate-500">
              <button
                type="button"
                className="font-medium hover:underline"
                onClick={() => update({ author: p.author, page: "" })}
              >
                {p.author}
              </button>{" "}
              · <time dateTime={p.created_at}>{fmtDate(p.created_at)}</time>
            </p>
            <p className="mb-2 break-words text-sm text-slate-700">{p.excerpt}</p>
            <div className="flex items-center justify-between gap-2">
              <TagList tags={p.tags} />
              {user?.is_admin && (
                <Button variant="danger" className="ml-auto" onClick={() => toggle(p.id)}>
                  {p.taken_down ? "Restore" : "Take down"}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {data && pages > 1 && (
        <div className="flex items-center justify-between">
          <Button variant="secondary" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>
            Previous
          </Button>
          <span className="text-sm text-slate-600">
            Page {data.page} of {pages}
          </span>
          <Button variant="secondary" disabled={page >= pages} onClick={() => update({ page: String(page + 1) })}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
