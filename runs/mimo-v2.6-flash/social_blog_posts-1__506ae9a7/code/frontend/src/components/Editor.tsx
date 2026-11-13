import { FormEvent, useEffect, useState } from "react";
import {
  ApiError,
  PostInput,
  createPost,
  deletePost,
  fetchPost,
  updatePost,
} from "../api";
import { navigate } from "../router";

type Props = {
  id: number | null;
};

export default function Editor({ id }: Props) {
  const isEdit = id !== null;
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id === null) return;
    let cancelled = false;
    setLoading(true);
    fetchPost(id)
      .then((post) => {
        if (cancelled) return;
        setTitle(post.title);
        setContent(post.content);
        setTagsText(post.tags.join(", "));
        setError("");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Failed to load post");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const input: PostInput = {
      title,
      content,
      tags: tagsText
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    };
    try {
      const post = id === null ? await createPost(input) : await updatePost(id, input);
      navigate(`/post/${post.id}`);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : "Failed to save post");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (id === null) return;
    if (!window.confirm("Delete this post? This cannot be undone.")) return;
    try {
      await deletePost(id);
      navigate("/");
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : "Failed to delete post");
    }
  }

  if (loading) {
    return <p className="text-gray-500">Loading post…</p>;
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">{isEdit ? "Edit post" : "New post"}</h1>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Title</span>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Post title"
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Content</span>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={14}
            placeholder="Write your post. Blank lines separate paragraphs."
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Tags</span>
          <input
            type="text"
            value={tagsText}
            onChange={(event) => setTagsText(event.target.value)}
            placeholder="python, flask, intro"
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
          />
          <span className="mt-1 block text-xs text-gray-500">
            Separate tags with commas.
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Publish"}
          </button>
          <a
            href={isEdit ? `#/post/${id}` : "#/"}
            className="text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Cancel
          </a>
          {isEdit && (
            <button
              type="button"
              onClick={handleDelete}
              className="ml-auto rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Delete
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
