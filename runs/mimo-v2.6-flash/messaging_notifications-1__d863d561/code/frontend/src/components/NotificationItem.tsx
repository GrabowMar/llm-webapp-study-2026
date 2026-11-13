import type { Notification } from "../types";

type Props = {
  notification: Notification;
  onToggle: (notification: Notification) => void;
  onDelete: (notification: Notification) => void;
};

const TYPE_STYLES: Record<string, string> = {
  info: "bg-blue-100 text-blue-700",
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-700",
  error: "bg-red-100 text-red-700",
  alert: "bg-red-100 text-red-700",
  announcement: "bg-purple-100 text-purple-700",
  message: "bg-sky-100 text-sky-700",
  note: "bg-gray-100 text-gray-700",
};

function typeStyle(type: string): string {
  return TYPE_STYLES[type.toLowerCase()] ?? "bg-gray-100 text-gray-700";
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function NotificationItem({ notification, onToggle, onDelete }: Props) {
  return (
    <li
      className={`flex flex-wrap items-start justify-between gap-3 px-4 py-3 ${
        notification.read ? "bg-white" : "bg-blue-50/70"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${typeStyle(notification.type)}`}
          >
            {notification.type}
          </span>
          {!notification.read && (
            <span className="text-xs font-semibold text-blue-700">Unread</span>
          )}
        </div>
        <p
          className={`mt-1 break-words text-sm ${
            notification.read ? "text-gray-600" : "font-bold text-gray-900"
          }`}
        >
          {notification.message}
        </p>
        <time className="mt-1 block text-xs text-gray-400">
          {formatDate(notification.created_at)}
        </time>
      </div>

      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => onToggle(notification)}
          className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          {notification.read ? "Mark unread" : "Mark read"}
        </button>
        <button
          type="button"
          onClick={() => onDelete(notification)}
          className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
        >
          Delete
        </button>
      </div>
    </li>
  );
}
