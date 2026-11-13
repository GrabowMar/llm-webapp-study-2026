import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import Layout from "../components/Layout";
import Notice from "../components/Notice";
import { AuthorLink, TagList } from "../components/TagBadge";
import { formatDateTime } from "../lib/format";
import type { Post } from "../types";

export default function PostPage() {
  const { id } = useParams();
  const postId = Number(id);
  const { user } = useAuth();
  const navigate = useNavigate();

  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [takenDown, setTakenDown] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(postId)) {
      setError("That post does not exist.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await api.getPost(postId);
      setPost(data);
      setError(null);
      if (user?.is_admin) {
        const hidden = await api.hiddenPosts();
        setTakenDown(hidden.items.some((item) => item.id === data.id));
      } else {
        setTakenDown(false);
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) {
        setError("That post does not exist or has been taken down.");
      } else {
        setError(cause instanceof ApiError ? cause.message : "Could not load the post.");
      }
      setPost(null);
    } finally {
      setLoading(false);
    }
  }, [postId, user?.is_admin]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async () => {
    if (!post) return;
    if (!window.confirm(`Delete "${post.title}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api.deletePost(post.id);
      navigate("/");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not delete the post.");
      setBusy(false);
    }
  };

  const handleToggle = async () => {
    if (!post) return;
    const message = takenDown
      ? `Restore "${post.title}"?`
      : `Take down "${post.title}"? Readers will no longer see it.`;
    if (!window.confirm(message)) return;
    setBusy(true);
    try {
      await api.togglePost(post.id);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not update the post.");
    } finally {
      setBusy(false);
    }
  };

  const isAuthor = Boolean(post && user && post.author === user.username);
  const paragraphs = (post?.content ?? "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/^\n+|\n+$/g, ""))
    .filter((paragraph) => paragraph.trim().length > 0);

  return (
    <Layout>
      <div className="space-y-6">
        <Link to="/" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
          ← Back to all posts
        </Link>

        {error ? <Notice tone="error">{error}</Notice> : null}

        {loading ? (
          <p className="py-10 text-center text-sm text-slate-500">Loading post…</p>
        ) : null}

        {post ? (
          <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">{post.title}</h1>
            <p className="mt-2 text-sm text-slate-500">
              by <AuthorLink author={post.author} /> · published {formatDateTime(post.created_at)}
              {post.updated_at !== post.created_at ? ` · updated ${formatDateTime(post.updated_at)}` : null}
            </p>

            {takenDown ? (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">
                This post is taken down. Only administrators can see it.
              </p>
            ) : null}

            <div className="mt-4">
              <TagList tags={post.tags} onClick={() => undefined} />
            </div>

            <div className="mt-6 space-y-4 text-[15px] leading-7 text-slate-700">
              {paragraphs.map((paragraph, index) => (
                <p key={index} className="whitespace-pre-wrap">
                  {paragraph}
                </p>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-5">
              {isAuthor ? (
                <>
                  <Link
                    to={`/posts/${post.id}/edit`}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
                  >
                    Edit post
                  </Link>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleDelete}
                    className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </>
              ) : null}

              {user?.is_admin ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleToggle}
                  className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
                >
                  {takenDown ? "Restore post" : "Take down post"}
                </button>
              ) : null}

              {!isAuthor && !user?.is_admin ? (
                <span className="text-sm text-slate-400">Read-only view</span>
              ) : null}
            </div>
          </article>
        ) : null}
      </div>
    </Layout>
  );
}
