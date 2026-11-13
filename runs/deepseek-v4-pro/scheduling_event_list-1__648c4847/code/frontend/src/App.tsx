import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearSession,
  createEvent,
  deleteEvent,
  EventInput,
  EventItem,
  getToken,
  getUsername,
  listEvents,
  updateEvent,
} from "./api";
import Auth from "./components/Auth";
import EventForm, { EventFormValues } from "./components/EventForm";
import EventModal from "./components/EventModal";
import {
  addDays,
  formatTime,
  fromLocalInputValue,
  gridDays,
  isSameDay,
  periodLabel,
  rangeFor,
  shift,
  startOfDay,
  startOfWeek,
  toLocalInputValue,
  toUtcIso,
  View,
  weekdayNames,
} from "./dates";

export default function App() {
  const [username, setUsername] = useState<string | null>(
    getToken() ? getUsername() : null
  );
  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState<Date>(startOfDay(new Date()));

  const [events, setEvents] = useState<EventItem[]>([]);
  const [loadError, setLoadError] = useState(false);

  const [selected, setSelected] = useState<EventItem | null>(null);
  const [editing, setEditing] = useState<EventItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<EventItem | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [showAuth, setShowAuth] = useState(false);

  const range = useMemo(() => rangeFor(view, anchor), [view, anchor]);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await listEvents(range);
      setEvents(res.items);
    } catch {
      setLoadError(true);
    }
  }, [range.start_date, range.end_date]);

  useEffect(() => {
    load();
  }, [load]);

  function flash(msg: string) {
    setNotices((n) => [...n, msg]);
    setTimeout(() => setNotices((n) => n.filter((m) => m !== msg)), 4000);
  }

  function signOut() {
    clearSession();
    setUsername(null);
    setSelected(null);
    setEditing(null);
    setCreating(false);
    setConfirmDelete(null);
  }

  function navigate(delta: number) {
    setAnchor((a) => shift(view, a, delta));
    setSelected(null);
  }

  function today() {
    setAnchor(startOfDay(new Date()));
    setSelected(null);
  }

  function openEvent(e: EventItem) {
    setSelected(e);
  }

  async function handleCreate(values: EventFormValues) {
    const input = toInput(values);
    await createEvent(input);
    setCreating(false);
    await load();
    flash("Event created.");
  }

  async function handleUpdate(values: EventFormValues) {
    if (!editing) return;
    const input = toInput(values);
    const updated = await updateEvent(editing.id, input);
    setEditing(null);
    setSelected(updated);
    await load();
    flash("Event updated.");
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    await deleteEvent(confirmDelete.id);
    setConfirmDelete(null);
    setSelected(null);
    await load();
    flash("Event deleted.");
  }

  function toInput(values: EventFormValues): EventInput {
    return {
      title: values.title,
      description: values.description || "",
      location: values.location || "",
      start_time: values.start_time ? toUtcIso(fromLocalInputValue(values.start_time)) : "",
      end_time: values.end_time ? toUtcIso(fromLocalInputValue(values.end_time)) : "",
    };
  }

  function formInitial(event: EventItem): EventFormValues {
    return {
      title: event.title,
      description: event.description ?? "",
      location: event.location ?? "",
      start_time: toLocalInputValue(new Date(event.start_time)),
      end_time: toLocalInputValue(new Date(event.end_time)),
    };
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <Header
        username={username}
        view={view}
        setView={setView}
        onSignOut={signOut}
        onSignIn={() => setShowAuth(true)}
      />

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(-1)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              ‹ Prev
            </button>
            <button
              onClick={today}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              Today
            </button>
            <button
              onClick={() => navigate(1)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              Next ›
            </button>
          </div>

          <h2 className="text-lg font-semibold text-slate-900">
            {periodLabel(view, anchor)}
          </h2>

          {username && (
            <button
              onClick={() => setCreating(true)}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              + New event
            </button>
          )}
        </div>

        {loadError && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            Failed to load events.
          </p>
        )}

        {view === "month" && (
          <MonthView
            anchor={anchor}
            events={events}
            onSelect={openEvent}
          />
        )}
        {view === "week" && (
          <WeekView
            anchor={anchor}
            events={events}
            onSelect={openEvent}
          />
        )}
        {view === "day" && (
          <DayView
            anchor={anchor}
            events={events}
            onSelect={openEvent}
          />
        )}
      </main>

      {selected && !confirmDelete && (
        <EventModal
          event={selected}
          canEdit={!!username}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setEditing(selected);
            setSelected(null);
          }}
          onDelete={() => setConfirmDelete(selected)}
        />
      )}

      {(creating || editing) && (
        <Modal onClose={() => (creating ? setCreating(false) : setEditing(null))}>
          <h2 className="mb-4 text-xl font-bold text-slate-900">
            {creating ? "New event" : "Edit event"}
          </h2>
          <EventForm
            key={editing ? editing.id : "new"}
            initial={editing ? formInitial(editing) : undefined}
            submitLabel={creating ? "Create" : "Save"}
            onSubmit={creating ? handleCreate : handleUpdate}
            onCancel={() => (creating ? setCreating(false) : setEditing(null))}
          />
        </Modal>
      )}

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)}>
          <h2 className="mb-2 text-xl font-bold text-slate-900">Delete event?</h2>
          <p className="mb-6 text-sm text-slate-600">
            This will permanently delete “{confirmDelete.title}”.
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setConfirmDelete(null)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </Modal>
      )}

      {showAuth && (
        <Modal onClose={() => setShowAuth(false)}>
          <Auth
            onAuthed={(name) => {
              setUsername(name);
              setShowAuth(false);
              flash(`Signed in as ${name}.`);
            }}
          />
        </Modal>
      )}

      {notices.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
          {notices.map((n, i) => (
            <div
              key={i}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg"
            >
              {n}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function Header({
  username,
  view,
  setView,
  onSignOut,
  onSignIn,
}: {
  username: string | null;
  view: View;
  setView: (v: View) => void;
  onSignOut: () => void;
  onSignIn: () => void;
}) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <h1 className="text-xl font-bold text-slate-900">Event Calendar</h1>

        <div className="flex rounded-lg bg-slate-100 p-1">
          {(["month", "week", "day"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1 text-sm font-medium capitalize transition ${
                view === v
                  ? "bg-white text-slate-900 shadow"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        {username ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">
              Signed in as{" "}
              <span className="font-semibold text-slate-900">{username}</span>
            </span>
            <button
              onClick={onSignOut}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">Browse as guest</span>
            <button
              onClick={onSignIn}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Sign in
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

function EventChip({
  event,
  onSelect,
}: {
  event: EventItem;
  onSelect: (e: EventItem) => void;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onSelect(event);
      }}
      className="block w-full truncate rounded bg-indigo-100 px-1.5 py-0.5 text-left text-xs font-medium text-indigo-800 hover:bg-indigo-200"
      title={`${event.title} · ${formatTime(event.start_time)}`}
    >
      {event.title}
    </button>
  );
}

function MonthView({
  anchor,
  events,
  onSelect,
}: {
  anchor: Date;
  events: EventItem[];
  onSelect: (e: EventItem) => void;
}) {
  const days = gridDays(anchor);
  const today = new Date();

  const byDay = useMemo(() => {
    const map = new Map<string, EventItem[]>();
    for (const e of events) {
      const key = new Date(e.start_time).toDateString();
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );
    }
    return map;
  }, [events]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {weekdayNames().map((w) => (
          <div
            key={w}
            className="px-2 py-2 text-center text-xs font-semibold uppercase text-slate-500"
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const inMonth = d.getMonth() === anchor.getMonth();
          const key = d.toDateString();
          const dayEvents = byDay.get(key) ?? [];
          const isToday = isSameDay(d, today);
          return (
            <div
              key={d.toISOString()}
              className={`min-h-24 border-b border-r border-slate-100 p-1 ${
                inMonth ? "bg-white" : "bg-slate-50"
              }`}
            >
              <div className="mb-1 flex items-center justify-between px-1">
                <span
                  className={`text-xs font-medium ${
                    inMonth ? "text-slate-700" : "text-slate-400"
                  } ${isToday ? "rounded-full bg-indigo-600 px-1.5 py-0.5 text-white" : ""}`}
                >
                  {d.getDate()}
                </span>
              </div>
              <div className="space-y-1">
                {dayEvents.slice(0, 3).map((e) => (
                  <EventChip key={e.id} event={e} onSelect={onSelect} />
                ))}
                {dayEvents.length > 3 && (
                  <div className="px-1.5 text-xs text-slate-500">
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({
  anchor,
  events,
  onSelect,
}: {
  anchor: Date;
  events: EventItem[];
  onSelect: (e: EventItem) => void;
}) {
  const ws = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const today = new Date();

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <div className="grid min-w-[640px] grid-cols-7 border-b border-slate-200 bg-slate-50">
        {days.map((d) => (
          <div
            key={d.toISOString()}
            className="px-2 py-2 text-center text-xs font-semibold text-slate-600"
          >
            <div>{weekdayNames()[(d.getDay() + 6) % 7]}</div>
            <div
              className={`mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full ${
                isSameDay(d, today)
                  ? "bg-indigo-600 text-white"
                  : "text-slate-500"
              }`}
            >
              {d.getDate()}
            </div>
          </div>
        ))}
      </div>
      <div className="grid min-w-[640px] grid-cols-7">
        {days.map((d) => {
          const dayEvents = events
            .filter((e) => isSameDay(new Date(e.start_time), d))
            .sort(
              (a, b) =>
                new Date(a.start_time).getTime() -
                new Date(b.start_time).getTime()
            );
          return (
            <div
              key={d.toISOString()}
              className="min-h-40 space-y-1 border-r border-slate-100 p-1.5"
            >
              {dayEvents.map((e) => (
                <button
                  key={e.id}
                  onClick={() => onSelect(e)}
                  className="block w-full rounded-lg bg-indigo-100 px-2 py-1 text-left text-xs hover:bg-indigo-200"
                >
                  <span className="font-semibold text-indigo-800">
                    {formatTime(e.start_time)}
                  </span>
                  <span className="block truncate font-medium text-indigo-900">
                    {e.title}
                  </span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayView({
  anchor,
  events,
  onSelect,
}: {
  anchor: Date;
  events: EventItem[];
  onSelect: (e: EventItem) => void;
}) {
  const dayEvents = events
    .filter((e) => isSameDay(new Date(e.start_time), anchor))
    .sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      {dayEvents.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-slate-500">
          No events on this day.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {dayEvents.map((e) => (
            <li key={e.id}>
              <button
                onClick={() => onSelect(e)}
                className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-slate-50"
              >
                <div className="w-20 shrink-0 text-sm font-semibold text-indigo-700">
                  {formatTime(e.start_time)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-900">
                    {e.title}
                  </div>
                  {e.location && (
                    <div className="truncate text-xs text-slate-500">
                      {e.location}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-xs text-slate-400">
                  {formatTime(e.end_time)}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
