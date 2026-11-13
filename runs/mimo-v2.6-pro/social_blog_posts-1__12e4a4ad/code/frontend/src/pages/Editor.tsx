import { useEffect, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { api } from "../api";
import type { Auth, Post } from "../api";
import { Link, navigate } from "../router";

function TagInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");

  const addTags = (raw: string) => {
    const parts = raw
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (parts.length === 0) return;
    const next = [...tags];
    for (const part of parts) {
      if (!next.includes(part)) next.push(part);
    }
    onChange(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTags(draft);
      setDraft("");
    } else if (event.key === "Backspace" && draft === "" && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-sm font-medium text-slate-700"
          >
            #{tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              className="text-slate-500 hover:text-slate-800"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        value={draft}
        onChange={(event) => {
          const value = event.target.value;
          if (value.includes(",")) {
            addTags(value);
            setDraft("");
          } else {
            setDraft(value);
          }
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          addTags(draft);
          setDraft("");
        }}
        placeholder="Add a tag, press Enter or type a comma"
        aria-label="Tags"
        className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
      />
    </div>
  );
}

export default function Editor({ auth, postId }: { auth: Auth | null; postId?: number }) {
  const isEdit = postId !== undefined;
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (postId === undefined) return;
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    api<Post>(`/api/posts/${postId}`, { token: auth?.token ?? null })
      .then((post) => {
        if (cancelled) return;
        setTitle(post.title);
        setContent(post.content);
        setTags(post.tags);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load post");
        setLoadFailed(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [postId, auth]);

  if (!auth) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-slate-700">You need to sign in to write posts.</p>
        <Link to="/login" className="mt-2 inline-block font-medium text-indigo-700 hover:underline">
          Go to sign in
        </Link>
      </div>
    );
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (postId !== undefined && loadFailed) return;
    setBusy(true);
    setError(null);
    const body = { title, content, tags };
    try {
      const post =
        isEdit && postId !== undefined
          ? await api<Post>(`/api/posts/${postId}`, {
              method: "PUT",
              body,
              token: auth.token,
            })
          : await api<Post>("/api/posts", { method: "POST", body, token: auth.token });
      navigate(`/posts/${post.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save post");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (postId === undefined) return;
    if (!window.confirm("Delete this post? This cannot be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/posts/${postId}`, { method: "DELETE", token: auth.token });
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete post");
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold">{isEdit ? "Edit post" : "New post"}</h1>

      {error && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loadFailed && (
        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="post-title" className="block text-sm font-medium text-slate-700">
              Title
            </label>
            <input
              id="post-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={loading}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="post-content" className="block text-sm font-medium text-slate-700">
              Content
            </label>
            <textarea
              id="post-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              disabled={loading}
              rows={12}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm focus:border-indigo-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-500">
              Plain text. Separate paragraphs with a blank line.
            </p>
          </div>
          <div>
            <span className="block text-sm font-medium text-slate-700">Tags</span>
            <TagInput tags={tags} onChange={setTags} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={busy || loading}
              className="rounded bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? "Saving…" : isEdit ? "Save changes" : "Publish"}
            </button>
            {isEdit && (
              <button
                type="button"
                onClick={onDelete}
                disabled={busy || loading}
                className="rounded border border-red-300 bg-red-50 px-4 py-2 font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
              >
                Delete
              </button>
            )}
            <Link to="/" className="text-sm font-medium text-slate-600 hover:underline">
              Cancel
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
