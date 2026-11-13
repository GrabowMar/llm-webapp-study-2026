import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import Layout from "../components/Layout";
import Notice from "../components/Notice";
import TagInput from "../components/TagInput";
import type { Post } from "../types";

export default function EditorPage() {
  const { id } = useParams();
  const editing = id !== undefined;
  const postId = Number(id);
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!editing || !Number.isFinite(postId)) return;
    setLoading(true);
    try {
      const data = await api.getPost(postId);
      setPost(data);
      setTitle(data.title);
      setContent(data.content);
      setTags(data.tags);
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not load the post.");
    } finally {
      setLoading(false);
    }
  }, [editing, postId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!authLoading && !user) {
    return <Navigate to="/login" replace />;
  }

  const ownPost = Boolean(post && user && post.author === user.username);
  const blocked = editing && post !== null && !ownPost;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = { title: title.trim(), content, tags };
      const saved = editing
        ? await api.updatePost(postId, payload)
        : await api.createPost(payload);
      navigate(`/posts/${saved.id}`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The post could not be saved.");
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!post) return;
    if (!window.confirm(`Delete "${post.title}"? This cannot be undone.`)) return;
    setSaving(true);
    try {
      await api.deletePost(post.id);
      navigate("/");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The post could not be deleted.");
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Link to="/" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
            ← Back to all posts
          </Link>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
            {editing ? "Edit post" : "Write a new post"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {editing
              ? "Changes are saved to your post and the updated date is refreshed."
              : "Publish a story for everyone to read. Add a few tags to help readers find it."}
          </p>
        </div>

        {error ? <Notice tone="error">{error}</Notice> : null}
        {notice ? <Notice tone="success">{notice}</Notice> : null}
        {blocked ? (
          <Notice tone="error">You can only edit your own posts.</Notice>
        ) : null}

        {loading ? (
          <p className="py-10 text-center text-sm text-slate-500">Loading post…</p>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-slate-700">
                Title
              </label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="A clear, descriptive title"
                disabled={blocked}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-50"
              />
            </div>

            <div>
              <label htmlFor="content" className="block text-sm font-medium text-slate-700">
                Content
              </label>
              <textarea
                id="content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                rows={14}
                placeholder="Write your story…"
                disabled={blocked}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-50"
              />
            </div>

            <div>
              <span className="block text-sm font-medium text-slate-700">Tags</span>
              <div className="mt-1.5">
                <TagInput tags={tags} onChange={setTags} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-5">
              <button
                type="submit"
                disabled={saving || blocked}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving…" : editing ? "Save changes" : "Publish post"}
              </button>
              <Link
                to={editing && post ? `/posts/${post.id}` : "/"}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </Link>
              {editing && post && ownPost ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleDelete}
                  className="ml-auto rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                >
                  Delete post
                </button>
              ) : null}
            </div>
          </form>
        )}
      </div>
    </Layout>
  );
}
