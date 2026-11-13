import type { Notification } from "../api";

const TYPE_STYLES: Record<string, string> = {
  info: "bg-sky-100 text-sky-800",
  success: "bg-green-100 text-green-800",
  warning: "bg-amber-100 text-amber-800",
  error: "bg-red-100 text-red-800",
  announcement: "bg-purple-100 text-purple-800",
};

const DEFAULT_TYPE_STYLE = "bg-slate-100 text-slate-700";

export function typeStyle(type: string): string {
  return TYPE_STYLES[type.toLowerCase()] ?? DEFAULT_TYPE_STYLE;
}

type Props = {
  notification: Notification;
  onToggleRead: (notification: Notification) => void;
  onDelete: (notification: Notification) => void;
};

export default function NotificationRow({ notification, onToggleRead, onDelete }: Props) {
  return (
    <li
      className={
        "flex items-start justify-between gap-3 rounded-lg border px-4 py-3 " +
        (notification.read ? "border-slate-200 bg-white" : "border-indigo-200 bg-indigo-50")
      }
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={
              "rounded-full px-2 py-0.5 text-xs font-medium " + typeStyle(notification.type)
            }
          >
            {notification.type}
          </span>
          <span className="text-xs text-slate-500">
            {new Date(notification.created_at).toLocaleString()}
          </span>
        </div>
        <p
          className={
            "mt-1 whitespace-pre-wrap break-words text-slate-800 " +
            (notification.read ? "font-normal text-slate-600" : "font-semibold")
          }
        >
          {notification.message}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => onToggleRead(notification)}
          className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          {notification.read ? "Mark unread" : "Mark read"}
        </button>
        <button
          type="button"
          onClick={() => onDelete(notification)}
          className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
        >
          Delete
        </button>
      </div>
    </li>
  );
}
