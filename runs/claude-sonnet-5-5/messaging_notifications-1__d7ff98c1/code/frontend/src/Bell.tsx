export default function Bell({ count }: { count: number }) {
  return (
    <div
      className="relative"
      role="status"
      aria-label={`${count} unread notifications`}
      title={`${count} unread`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6 text-slate-700"
        aria-hidden="true"
      >
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </svg>
      {count > 0 && (
        <span
          data-testid="unread-count"
          className="absolute -right-2 -top-2 min-w-5 rounded-full bg-red-600 px-1 text-center text-xs font-bold text-white"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </div>
  );
}
