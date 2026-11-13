import { useEffect, useState, type FormEvent } from "react";
import { ApiError, request } from "../api";
import { useAuth } from "../auth";
import { useRouter } from "../router";
import type { Post } from "../types";
import { Alert, Button, Field, Spinner, TextArea, TextInput } from "../components/ui";

export function EditorPage({ id }: { id?: number }) {
  const { user, loading: authLoading } = useAuth();
  const { navigate } = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [busy, setBusy] = useState(false);
  const [notOwner, setNotOwner] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate(`/login?next=${encodeURIComponent(id ? `/posts/${id}/edit` : "/new")}`);
    }
  }, [authLoading, user, id, navigate]);

  useEffect(() => {
    if (!id) return;
    let active = true;
    request<Post>(`/api/posts/${id}`)
      .then((post) => {
        if (!active) return;
        setTitle(post.title);
        setContent(post.content);
        setTags(post.tags);
        setNotOwner(
          Boolean(
            user && user.username.toLowerCase() !== post.author.toLowerCase(),
          ),
        );
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to load post.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, user]);

  function addTags(raw: string) {
    const parts = raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    setTags((current) => {
      const seen = new Set(current.map((t) => t.toLowerCase()));
      const next = [...current];
      for (const part of parts) {
        const key = part.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(part);
      }
      return next;
    });
  }

  function onTagKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTags(tagDraft);
      setTagDraft("");
    } else if (event.key === "Backspace" && !tagDraft && tags.length > 0) {
      setTags((current) => current.slice(0, -1));
    }
  }

  async function remove() {
    if (!id) return;
    if (!window.confirm("Delete this post? This cannot be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      await request(`/api/posts/${id}`, { method: "DELETE" });
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete the post.");
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const finalTags = [...tags];
    if (tagDraft.trim()) {
      const extra = tagDraft
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      for (const tag of extra) {
        if (!finalTags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
          finalTags.push(tag);
        }
      }
    }
    setBusy(true);
    try {
      const body = { title, content, tags: finalTags };
      if (id) {
        const updated = await request<Post>(`/api/posts/${id}`, {
          method: "PUT",
          body,
        });
        navigate(`/posts/${updated.id}`);
      } else {
        const created = await request<Post>("/api/posts", {
          method: "POST",
          body,
        });
        navigate(`/posts/${created.id}`);
      }
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Failed to save the post.",
      );
      setBusy(false);
    }
  }

  if (authLoading || loading) return <Spinner />;
  if (!user) return null;
  if (notOwner) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Alert>You can only edit your own posts.</Alert>
        <Button variant="secondary" onClick={() => navigate(`/posts/${id}`)}>
          View the post
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold">{id ? "Edit post" : "New post"}</h1>
      <form
        onSubmit={submit}
        className="space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      >
        {error && <Alert>{error}</Alert>}
        <Field label="Title">
          <TextInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
            placeholder="An eye-catching title"
          />
        </Field>
        <Field label="Content" hint="Line breaks are preserved when the post is displayed.">
          <TextArea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            rows={16}
            placeholder="Write your story…"
          />
        </Field>
        <Field label="Tags" hint="Type a tag and press Enter or comma. Backspace removes the last tag.">
          <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-2 focus-within:border-slate-500 focus-within:ring-2 focus-within:ring-slate-200">
            {tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                {tag}
                <button
                  type="button"
                  aria-label={`Remove ${tag}`}
                  className="text-slate-400 hover:text-slate-700"
                  onClick={() => setTags((current) => current.filter((t) => t !== tag))}
                >
                  ×
                </button>
              </span>
            ))}
            <input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={onTagKeyDown}
              onBlur={() => {
                addTags(tagDraft);
                setTagDraft("");
              }}
              className="min-w-[8rem] flex-1 border-none bg-transparent px-1 py-1 text-sm outline-none"
              placeholder={tags.length ? "" : "Add tags…"}
            />
          </div>
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : id ? "Save changes" : "Publish"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate(id ? `/posts/${id}` : "/")}
          >
            Cancel
          </Button>
          {id && (
            <Button
              type="button"
              variant="danger"
              className="ml-auto"
              onClick={remove}
            >
              Delete
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
