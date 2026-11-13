import type { Notification } from "../api";
import NotificationRow from "./NotificationRow";

type Props = {
  items: Notification[];
  total: number;
  page: number;
  pageSize: number;
  readFilter: string;
  typeFilter: string;
  loading: boolean;
  onReadFilterChange: (value: string) => void;
  onTypeFilterChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onMarkAllRead: () => void;
  onToggleRead: (notification: Notification) => void;
  onDelete: (notification: Notification) => void;
};

export default function Inbox({
  items,
  total,
  page,
  pageSize,
  readFilter,
  typeFilter,
  loading,
  onReadFilterChange,
  onTypeFilterChange,
  onPageChange,
  onMarkAllRead,
  onToggleRead,
  onDelete,
}: Props) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section
      id="inbox"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">
          Inbox <span className="text-sm font-normal text-slate-500">({total} total)</span>
        </h2>
        <button
          type="button"
          onClick={onMarkAllRead}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Mark all as read
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Read state</span>
          <select
            value={readFilter}
            onChange={(event) => onReadFilterChange(event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All</option>
            <option value="false">Unread</option>
            <option value="true">Read</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Type</span>
          <input
            list="inbox-type-options"
            value={typeFilter}
            onChange={(event) => onTypeFilterChange(event.target.value)}
            placeholder="All types"
            className="w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>
        <datalist id="inbox-type-options">
          <option value="info" />
          <option value="success" />
          <option value="warning" />
          <option value="error" />
          <option value="announcement" />
        </datalist>
      </div>

      {loading && items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No notifications match the current filters.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((notification) => (
            <NotificationRow
              key={notification.id}
              notification={notification}
              onToggleRead={onToggleRead}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
        >
          Previous
        </button>
        <span className="text-sm text-slate-500">
          Page {Math.min(page, pageCount)} of {pageCount}
        </span>
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </section>
  );
}
