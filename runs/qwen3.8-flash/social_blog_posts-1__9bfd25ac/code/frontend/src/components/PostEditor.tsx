import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import type { Post } from "../types";
import { ErrorBanner, inputClass } from "./ui";

function parseTags(raw: string): string[] {
  const seen = new Map<string, string>();
  for (const part of raw.split(",")) {
    const tag = part.trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (!seen.has(key)) seen.set(key, tag);
  }
  return [...seen.values()];
}

export function PostEditor({
  postId,
  onSaved,
  onNavigate,
}: {
  postId: number | null;
  onSaved: (post: Post) => void;
  onNavigate: (to: string) => void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState<Post | null>(null);
  const [loaded, setLoaded] = useState(postId === null);

  useEffect(() => {
    if (postId === null) return;
    api
      .getPost(postId)
      .then((post) => {
        if (post.author !== user?.username) {
          setLoadError("You can only edit your own posts.");
          return;
        }
        setExisting(post);
        setTitle(post.title);
        setContent(post.content);
        setTagsRaw(post.tags.join(", "));
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load post"))
      .finally(() => setLoaded(true));
  }, [postId, user]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    const input = { title, content, tags: parseTags(tagsRaw) };
    try {
      const saved =
        existing !== null
          ? await api.updatePost(existing.id, input)
          : await api.createPost(input);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the post");
      setBusy(false);
    }
  };

  const remove = async () => {
    if (existing === null) return;
    if (!window.confirm(`Delete “${existing.title}”? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api.deletePost(existing.id);
      onNavigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete post");
      setBusy(false);
    }
  };

  if (!loaded) return <p className="text-sm text-slate-500">Loading…</p>;

  if (loadError) {
    return (
      <div className="space-y-4">
        <ErrorBanner message={loadError} />
        <button
          type="button"
          onClick={() => onNavigate("/")}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          ← Back to posts
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-5 text-xl font-bold text-slate-900">
          {existing ? "Edit post" : "New post"}
        </h1>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="title" className="mb-1 block text-sm font-medium text-slate-700">
              Title
            </label>
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
              placeholder="A catchy title"
              required
            />
          </div>
          <div>
            <label htmlFor="content" className="mb-1 block text-sm font-medium text-slate-700">
              Content
            </label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={12}
              className={`${inputClass} resize-y font-mono text-sm`}
              placeholder="Write your post. Blank lines separate paragraphs."
              required
            />
          </div>
          <div>
            <label htmlFor="tags" className="mb-1 block text-sm font-medium text-slate-700">
              Tags
            </label>
            <input
              id="tags"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              className={inputClass}
              placeholder="python, web, tips (comma separated)"
            />
            {parseTags(tagsRaw).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {parseTags(tagsRaw).map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {error && <ErrorBanner message={error} onDismiss={() => setError("")} />}

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? "Saving…" : existing ? "Save changes" : "Publish"}
            </button>
            <button
              type="button"
              onClick={() => onNavigate(existing ? `/posts/${existing.id}` : "/")}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            {existing && (
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="ml-auto rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Delete post
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
