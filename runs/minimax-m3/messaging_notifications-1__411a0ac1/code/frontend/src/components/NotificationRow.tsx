import type { Notification } from "./types";

const BADGE_STYLES: Record<string, string> = {
  info: "bg-sky-100 text-sky-700 ring-sky-600/20",
  success: "bg-emerald-100 text-emerald-700 ring-emerald-600/20",
  warning: "bg-amber-100 text-amber-800 ring-amber-600/20",
  error: "bg-rose-100 text-rose-700 ring-rose-600/20",
  danger: "bg-rose-100 text-rose-700 ring-rose-600/20",
  announcement: "bg-indigo-100 text-indigo-700 ring-indigo-600/20",
  message: "bg-violet-100 text-violet-700 ring-violet-600/20",
  alert: "bg-orange-100 text-orange-700 ring-orange-600/20",
};

const DEFAULT_BADGE = "bg-slate-100 text-slate-700 ring-slate-500/20";

export function TypeBadge({ type }: { type: string }) {
  const style = BADGE_STYLES[type.toLowerCase()] ?? DEFAULT_BADGE;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide ring-1 ring-inset ${style}`}
    >
      {type}
    </span>
  );
}

export function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NotificationRow({
  notification,
  onToggle,
  onDelete,
  busy,
}: {
  notification: Notification;
  onToggle: (notification: Notification) => void;
  onDelete: (notification: Notification) => void;
  busy: boolean;
}) {
  return (
    <li
      data-testid="notification-item"
      data-read={notification.read ? "true" : "false"}
      className={`flex items-start gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 ${
        notification.read ? "bg-white" : "bg-indigo-50/40"
      }`}
    >
      <span
        aria-hidden="true"
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
          notification.read ? "bg-slate-300" : "bg-indigo-500"
        }`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <TypeBadge type={notification.type} />
          {notification.read ? null : (
            <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
              Unread
            </span>
          )}
        </div>
        <p
          data-testid="notification-message"
          className={`mt-1 whitespace-pre-wrap break-words text-sm ${
            notification.read ? "font-normal text-slate-600" : "font-semibold text-slate-900"
          }`}
        >
          {notification.message}
        </p>
        <p className="mt-1 text-xs text-slate-400">{formatTimestamp(notification.created_at)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => onToggle(notification)}
          disabled={busy}
          className={`rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            notification.read
              ? "text-slate-600 hover:bg-slate-100"
              : "text-indigo-700 hover:bg-indigo-100"
          }`}
        >
          {notification.read ? "Mark as unread" : "Mark as read"}
        </button>
        <button
          type="button"
          onClick={() => onDelete(notification)}
          disabled={busy}
          aria-label={`Delete notification`}
          className="rounded-md px-2 py-1 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </li>
  );
}
