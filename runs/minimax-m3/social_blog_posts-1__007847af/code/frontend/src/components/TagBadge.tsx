import { Link } from "react-router-dom";

export default function TagBadge({
  tag,
  onClick,
  active = false,
}: {
  tag: string;
  onClick?: (tag: string) => void;
  active?: boolean;
}) {
  const classes = `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
    active
      ? "bg-indigo-600 text-white"
      : "bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-700"
  }`;

  if (!onClick) {
    return <span className={classes}>{tag}</span>;
  }

  return (
    <button type="button" className={classes} onClick={() => onClick(tag)}>
      {tag}
    </button>
  );
}

export function TagList({
  tags,
  onClick,
}: {
  tags: string[];
  onClick?: (tag: string) => void;
}) {
  if (tags.length === 0) {
    return <span className="text-xs text-slate-400">No tags</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <TagBadge key={tag} tag={tag} onClick={onClick} />
      ))}
    </div>
  );
}

export function AuthorLink({ author }: { author: string }) {
  return (
    <Link
      to={`/?author=${encodeURIComponent(author)}`}
      className="font-medium text-slate-700 hover:text-indigo-600"
    >
      {author}
    </Link>
  );
}
