import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import { Link, navigate } from "../router";
import { Alert, btnPrimary, btnSecondary, Card, FieldError, inputCls } from "../ui";

function TagInput({ tags, onChange, invalid }: { tags: string[]; onChange: (t: string[]) => void; invalid: boolean }) {
  const [draft, setDraft] = useState("");

  const commit = (raw: string) => {
    const parts = raw
      .split(",")
      .map((s) => s.trim().replace(/\s+/g, " "))
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...tags];
    for (const p of parts) if (!next.some((t) => t.toLowerCase() === p.toLowerCase())) next.push(p);
    onChange(next);
    setDraft("");
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && draft === "" && tags.length) {
      onChange(tags.slice(0, -1));
    }
  };

  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-md border bg-white px-2 py-1.5 shadow-sm focus-within:ring-2 focus-within:ring-indigo-200 ${
        invalid ? "border-red-400" : "border-slate-300"
      }`}
    >
      {tags.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
          #{t}
          <button
            type="button"
            className="ml-0.5 text-indigo-400 hover:text-indigo-800"
            aria-label={`Remove tag ${t}`}
            onClick={() => onChange(tags.filter((x) => x !== t))}
          >
            ×
          </button>
        </span>
      ))}
      <input
        id="tags"
        className="min-w-[8rem] flex-1 border-0 px-1 py-1 text-sm focus:outline-none"
        placeholder={tags.length ? "" : "Add tags (Enter or comma)"}
        value={draft}
        onChange={(e) => {
          const v = e.target.value;
          if (v.includes(",")) commit(v);
          else setDraft(v);
        }}
        onKeyDown={onKey}
        onBlur={() => commit(draft)}
        aria-invalid={invalid}
      />
    </div>
  );
}

export default function PostEditor({ id }: { id?: number }) {
  const { user, ready } = useAuth();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(id !== undefined);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && !user) navigate(`/login?next=${encodeURIComponent(window.location.pathname)}`, true);
  }, [ready, user]);

  useEffect(() => {
    if (id === undefined || !user) return;
    let cancelled = false;
    setLoading(true);
    api
      .getPost(id)
      .then((p) => {
        if (cancelled) return;
        if (p.author !== user.username) {
          setLoadError("You can only edit your own posts.");
          return;
        }
        setTitle(p.title);
        setContent(p.content);
        setTags(p.tags);
      })
      .catch((err) => !cancelled && setLoadError(err instanceof ApiError ? (err.status === 404 ? "Post not found." : err.message) : "Failed to load post."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id, user]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setFieldErrors({});
    setBusy(true);
    try {
      const body = { title, content, tags };
      const saved = id === undefined ? await api.createPost(body) : await api.updatePost(id, body);
      navigate(`/posts/${saved.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.errors);
      } else setError("Save failed.");
    } finally {
      setBusy(false);
    }
  };

  if (!ready || !user) return null;
  if (loadError) return <Alert>{loadError}</Alert>;
  if (loading) return <p className="text-slate-500">Loading…</p>;

  return (
    <Card>
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">{id === undefined ? "New post" : "Edit post"}</h1>
      <form onSubmit={submit} className="space-y-5" noValidate>
        {error && (
          <Alert>
            {error}
            {Object.keys(fieldErrors).length > 0 && (
              <ul className="mt-1 list-inside list-disc">
                {Object.entries(fieldErrors).map(([k, v]) => (
                  <li key={k}>{v}</li>
                ))}
              </ul>
            )}
          </Alert>
        )}
        <div>
          <label htmlFor="title" className="mb-1 block text-sm font-medium text-slate-700">
            Title
          </label>
          <input
            id="title"
            className={`${inputCls} ${fieldErrors.title ? "border-red-400" : ""}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={!!fieldErrors.title}
          />
          <FieldError message={fieldErrors.title} />
        </div>
        <div>
          <label htmlFor="content" className="mb-1 block text-sm font-medium text-slate-700">
            Content
          </label>
          <textarea
            id="content"
            rows={14}
            className={`${inputCls} font-mono ${fieldErrors.content ? "border-red-400" : ""}`}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            aria-invalid={!!fieldErrors.content}
          />
          <p className="mt-1 text-xs text-slate-500">Plain text. Separate paragraphs with a blank line.</p>
          <FieldError message={fieldErrors.content} />
        </div>
        <div>
          <label htmlFor="tags" className="mb-1 block text-sm font-medium text-slate-700">
            Tags
          </label>
          <TagInput tags={tags} onChange={setTags} invalid={!!fieldErrors.tags} />
          <FieldError message={fieldErrors.tags} />
        </div>
        <div className="flex gap-3">
          <button type="submit" className={btnPrimary} disabled={busy}>
            {busy ? "Saving…" : id === undefined ? "Publish" : "Save changes"}
          </button>
          <Link href={id === undefined ? "/" : `/posts/${id}`} className={btnSecondary}>
            Cancel
          </Link>
        </div>
      </form>
    </Card>
  );
}
