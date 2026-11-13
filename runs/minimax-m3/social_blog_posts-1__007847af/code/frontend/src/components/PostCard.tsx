import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { formatDate } from "../lib/format";
import type { Post } from "../types";
import { AuthorLink, TagList } from "./TagBadge";

export default function PostCard({
  post,
  onTagClick,
  actions,
}: {
  post: Post;
  onTagClick?: (tag: string) => void;
  actions?: ReactNode;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">
          <Link to={`/posts/${post.id}`} className="hover:text-indigo-600">
            {post.title}
          </Link>
        </h2>
        {actions}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        by <AuthorLink author={post.author} /> · {formatDate(post.created_at)}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">{post.excerpt}</p>
      <div className="mt-4">
        <TagList tags={post.tags} onClick={onTagClick} />
      </div>
    </article>
  );
}
