import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  Reservation,
  Slot,
  getToken,
  today,
  useSession,
} from "./api";
import AuthPanel from "./components/AuthPanel";
import AvailabilityPanel from "./components/AvailabilityPanel";
import AdminPanel from "./components/AdminPanel";
import MyReservations from "./components/MyReservations";
import ReservationForm, {
  FormData,
  formToPayload,
  reservationToForm,
} from "./components/ReservationForm";
import { api } from "./api";

const emptyForm = (date: string): FormData => ({
  name: "",
  email: "",
  date,
  time: "18:00",
  party_size: "2",
  notes: "",
});

export default function App() {
  const session = useSession();
  const [date, setDate] = useState(today());
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  const [form, setForm] = useState<FormData>(() => emptyForm(today()));
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [myItems, setMyItems] = useState<Reservation[]>([]);
  const [myLoading, setMyLoading] = useState(false);
  const [myError, setMyError] = useState<string | null>(null);

  const [adminItems, setAdminItems] = useState<Reservation[]>([]);
  const [adminTotal, setAdminTotal] = useState(0);
  const [adminPage, setAdminPage] = useState(1);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  const refreshAvailability = useCallback(async (d: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      setSlots(null);
      setSlotsError("Pick a valid date.");
      return;
    }
    try {
      const { items } = await api.availability(d);
      setSlots(items);
      setSlotsError(null);
    } catch (err) {
      setSlotsError(err instanceof ApiError ? err.message : "Could not load availability.");
    }
  }, []);

  const refreshMine = useCallback(async () => {
    setMyLoading(true);
    try {
      const { items } = await api.listReservations();
      setMyItems(items);
      setMyError(null);
    } catch (err) {
      setMyError(err instanceof ApiError ? err.message : "Could not load reservations.");
    } finally {
      setMyLoading(false);
    }
  }, []);

  const refreshAdmin = useCallback(async (d: string, page: number) => {
    if (!session.isAdmin) return;
    setAdminLoading(true);
    try {
      const res = await api.adminReservations(d, page, 20);
      setAdminItems(res.items);
      setAdminTotal(res.total);
      setAdminPage(res.page);
      setAdminError(null);
    } catch (err) {
      setAdminError(
        err instanceof ApiError ? err.message : "Could not load admin data."
      );
    } finally {
      setAdminLoading(false);
    }
  }, [session.isAdmin]);

  useEffect(() => {
    if (getToken()) refreshMine();
  }, [refreshMine, session.username]);

  useEffect(() => {
    refreshAvailability(date);
  }, [date, refreshAvailability]);

  useEffect(() => {
    if (session.isAdmin) refreshAdmin(date, adminPage);
  }, [date, adminPage, session.isAdmin, refreshAdmin]);

  const grouped = useMemo(() => {
    const m = new Map<string, Reservation[]>();
    for (const r of myItems) {
      const list = m.get(r.date) ?? [];
      list.push(r);
      m.set(r.date, list);
    }
    return [...m.entries()];
  }, [myItems]);

  async function submitForm() {
    setFormBusy(true);
    setFormError(null);
    setFormSuccess(null);
    const payload = formToPayload(form);
    try {
      if (editingId != null) {
        await api.updateReservation(editingId, payload);
        setFormSuccess("Reservation updated.");
      } else {
        await api.createReservation(payload);
        setFormSuccess("Table booked.");
      }
      await Promise.all([refreshAvailability(form.date), refreshMine()]);
      if (session.isAdmin) refreshAdmin(date, 1);
      if (editingId != null) {
        setEditingId(null);
        setForm(emptyForm(date));
      }
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not save the reservation.");
    } finally {
      setFormBusy(false);
    }
  }

  function startEdit(r: Reservation) {
    setEditingId(r.id);
    setForm(reservationToForm(r));
    setFormSuccess(null);
    setFormError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function stopEdit() {
    setEditingId(null);
    setForm(emptyForm(date));
    setFormError(null);
    setFormSuccess(null);
  }

  async function cancelReservation(r: Reservation) {
    await api.deleteReservation(r.id);
    if (editingId === r.id) stopEdit();
    await Promise.all([refreshAvailability(r.date), refreshMine()]);
    if (session.isAdmin) refreshAdmin(date, 1);
    setFormSuccess("Reservation cancelled and seats freed.");
  }

  function handleDateChange(d: string) {
    setDate(d);
    setAdminPage(1);
    if (editingId == null) setForm((f) => ({ ...f, date: d }));
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-bold text-slate-800">Table Reservations</h1>
            <p className="text-xs text-slate-500">20 guests per time slot</p>
          </div>
          {getToken() && session.username && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">
                Signed in as{" "}
                <span className="font-semibold">
                  {session.username}
                  {session.isAdmin && (
                    <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                      admin
                    </span>
                  )}
                </span>
              </span>
              <button
                onClick={session.signOut}
                className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-50"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-slate-600">Day</label>
          <input
            type="date"
            value={date}
            onChange={(e) => handleDateChange(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </div>

        <AvailabilityPanel date={date} slots={slots} error={slotsError} />

        {!getToken() ? (
          <AuthPanel onSignedIn={session.signIn} />
        ) : (
          <>
            {session.isAdmin && (
              <AdminPanel
                date={date}
                items={adminItems}
                total={adminTotal}
                page={adminPage}
                pageSize={20}
                loading={adminLoading}
                error={adminError}
                onPage={setAdminPage}
              />
            )}
            <ReservationForm
              form={form}
              setForm={setForm}
              error={formError}
              success={formSuccess}
              submitLabel={editingId != null ? "Save changes" : "Book a table"}
              onSubmit={submitForm}
              onCancelEdit={editingId != null ? stopEdit : undefined}
              busy={formBusy}
            />
            <MyReservations
              groups={grouped}
              loading={myLoading}
              error={myError}
              onEdit={startEdit}
              onCancel={cancelReservation}
              editingId={editingId}
            />
          </>
        )}
      </main>
    </div>
  );
}
