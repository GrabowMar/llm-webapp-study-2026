import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { Button, ErrorBox, inputCls } from "../ui";

export default function Editor() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(!!id);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id || !user) return;
    api
      .getPost(id)
      .then((p) => {
        if (p.author !== user.username) setError("You can only edit your own posts");
        else {
          setTitle(p.title);
          setContent(p.content);
          setTags(p.tags);
        }
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load post"))
      .finally(() => setLoading(false));
  }, [id, user]);

  if (!user)
    return (
      <p>
        Please <Link to="/login" className="text-indigo-700 hover:underline">sign in</Link> to write posts.
      </p>
    );

  function addTags(raw: string) {
    const parts = raw.split(",").map((t) => t.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...tags];
    for (const t of parts) if (!next.some((x) => x.toLowerCase() === t.toLowerCase())) next.push(t);
    setTags(next);
    setTagInput("");
  }

  function onTagKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTags(tagInput);
    } else if (e.key === "Backspace" && !tagInput && tags.length) {
      setTags(tags.slice(0, -1));
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setFields({});
    const finalTags = [...tags];
    for (const t of tagInput.split(",").map((s) => s.trim()).filter(Boolean))
      if (!finalTags.some((x) => x.toLowerCase() === t.toLowerCase())) finalTags.push(t);
    try {
      const body = { title, content, tags: finalTags };
      const post = id ? await api.updatePost(Number(id), body) : await api.createPost(body);
      navigate(`/posts/${post.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setFields(err.fields);
        setError(Object.keys(err.fields).length ? "" : err.message);
      } else setError("Something went wrong");
      setBusy(false);
    }
  }

  if (loading) return <p className="text-slate-500">Loading…</p>;

  const fieldErr = (k: string) =>
    fields[k] ? <span className="mt-1 block text-sm text-red-600">{fields[k]}</span> : null;

  return (
    <form onSubmit={submit} className="space-y-4 rounded bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold">{id ? "Edit post" : "New post"}</h1>
      {error && <ErrorBox>{error}</ErrorBox>}
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Title</span>
        <input className={inputCls} name="title" value={title} onChange={(e) => setTitle(e.target.value)} />
        {fieldErr("title")}
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Content</span>
        <textarea
          className={inputCls}
          name="content"
          rows={12}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        {fieldErr("content")}
      </label>
      <div>
        <label htmlFor="tag-input" className="mb-1 block text-sm font-medium text-slate-700">
          Tags
        </label>
        <div className="flex flex-wrap gap-1 rounded border border-slate-300 p-2">
          {tags.map((t) => (
            <span key={t} className="flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
              {t}
              <button
                type="button"
                aria-label={`Remove tag ${t}`}
                onClick={() => setTags(tags.filter((x) => x !== t))}
              >
                ×
              </button>
            </span>
          ))}
          <input
            id="tag-input"
            className="min-w-32 flex-1 text-sm outline-none"
            placeholder="Add a tag, press Enter"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={onTagKey}
            onBlur={() => addTags(tagInput)}
          />
        </div>
        {fieldErr("tags")}
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {id ? "Save changes" : "Publish"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
