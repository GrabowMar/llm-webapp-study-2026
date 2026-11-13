import { useEffect, useState, type FormEvent } from "react";
import Link, { navigate } from "../router";
import { api, toApiError } from "../api";

interface Props {
  mode: "create" | "edit";
  id?: number;
  user: string | null;
}

export default function ItemFormPage({ mode, id, user }: Props) {
  const isEdit = mode === "edit";

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [location, setLocation] = useState("");
  const [reorderLevel, setReorderLevel] = useState("0");
  const [quantity, setQuantity] = useState("0");
  const [currentQuantity, setCurrentQuantity] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(isEdit);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isEdit || !id) return;
    let cancelled = false;
    api
      .getItem(id)
      .then((item) => {
        if (cancelled) return;
        setName(item.name);
        setSku(item.sku);
        setLocation(item.location);
        setReorderLevel(String(item.reorder_level));
        setCurrentQuantity(item.quantity);
        setError(null);
        setFieldErrors({});
      })
      .catch((err) => {
        if (!cancelled) setError(toApiError(err).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isEdit, id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const body = {
        name,
        sku,
        location,
        reorder_level: Number(reorderLevel) || 0,
        ...(isEdit ? {} : { quantity: Number(quantity) || 0 }),
      };
      const item = isEdit && id ? await api.updateItem(id, body) : await api.createItem(body);
      navigate(`/items/${item.id}`);
    } catch (err) {
      const apiError = toApiError(err);
      setError(apiError.message);
      setFieldErrors(apiError.errors);
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-slate-200 bg-white p-8 text-center">
        <p className="font-semibold">Sign in required</p>
        <p className="mt-1 text-sm text-slate-600">
          {isEdit ? "Editing items" : "Adding items"} needs a signed-in account.
        </p>
        <Link
          to="/login"
          className="mt-4 inline-block rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (loading) {
    return <p className="text-slate-500">Loading item…</p>;
  }

  return (
    <div className="mx-auto max-w-lg">
      <Link
        to={isEdit && id ? `/items/${id}` : "/"}
        className="text-sm text-sky-700 hover:underline"
      >
        ← {isEdit ? "Back to item" : "Back to inventory"}
      </Link>

      <div className="mt-3 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">{isEdit ? "Edit item" : "Add item"}</h1>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        <form onSubmit={submit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium">
              Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            {fieldErrors.name && (
              <p className="mt-1 text-sm text-red-600">{fieldErrors.name}</p>
            )}
          </div>

          <div>
            <label htmlFor="sku" className="block text-sm font-medium">
              SKU
            </label>
            <input
              id="sku"
              type="text"
              value={sku}
              onChange={(event) => setSku(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            {fieldErrors.sku && (
              <p className="mt-1 text-sm text-red-600">{fieldErrors.sku}</p>
            )}
          </div>

          <div>
            <label htmlFor="item-location" className="block text-sm font-medium">
              Location
            </label>
            <input
              id="item-location"
              type="text"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            {fieldErrors.location && (
              <p className="mt-1 text-sm text-red-600">{fieldErrors.location}</p>
            )}
          </div>

          <div>
            <label htmlFor="reorder" className="block text-sm font-medium">
              Reorder level
            </label>
            <input
              id="reorder"
              type="number"
              min={0}
              step={1}
              value={reorderLevel}
              onChange={(event) => setReorderLevel(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            {fieldErrors.reorder_level && (
              <p className="mt-1 text-sm text-red-600">{fieldErrors.reorder_level}</p>
            )}
          </div>

          {isEdit ? (
            <div>
              <span className="block text-sm font-medium">Quantity</span>
              <p className="mt-1 rounded bg-slate-100 px-3 py-2 text-sm text-slate-700">
                {currentQuantity ?? "—"} — quantity changes only through stock movements.
              </p>
            </div>
          ) : (
            <div>
              <label htmlFor="quantity" className="block text-sm font-medium">
                Opening quantity
              </label>
              <input
                id="quantity"
                type="number"
                min={0}
                step={1}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              {fieldErrors.quantity && (
                <p className="mt-1 text-sm text-red-600">{fieldErrors.quantity}</p>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={busy}
              className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-60"
            >
              {busy ? "Saving…" : isEdit ? "Save changes" : "Add item"}
            </button>
            <Link
              to={isEdit && id ? `/items/${id}` : "/"}
              className="rounded border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
