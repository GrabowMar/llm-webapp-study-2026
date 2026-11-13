import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ApiError,
  createItem,
  getItem,
  updateItem,
} from "../api";
import { Alert, Field, inputClass } from "../components/ui";

export default function ItemFormPage({ mode }: { mode: "create" | "edit" }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = mode === "edit";

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [location, setLocation] = useState("");
  const [quantity, setQuantity] = useState("0");
  const [reorderLevel, setReorderLevel] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isEdit || !id) return;
    let active = true;
    setLoading(true);
    getItem(id)
      .then((item) => {
        if (!active) return;
        setName(item.name);
        setSku(item.sku);
        setLocation(item.location);
        setReorderLevel(String(item.reorder_level));
        setQuantity(String(item.quantity));
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load item.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, isEdit]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const reorder = reorderLevel.trim() === "" ? 0 : Number(reorderLevel);
      const payload = {
        name: name.trim(),
        sku: sku.trim(),
        location: location.trim(),
        reorder_level: Number.isFinite(reorder) ? reorder : 0,
      };

      if (isEdit && id) {
        await updateItem(id, payload);
        navigate(`/items/${id}`);
      } else {
        const opening = quantity.trim() === "" ? 0 : Number(quantity);
        const created = await createItem({
          ...payload,
          quantity: Number.isFinite(opening) ? opening : 0,
        });
        navigate(`/items/${created.id}`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Loading item…</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          to={isEdit && id ? `/items/${id}` : "/"}
          className="text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          ← Back
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {isEdit ? "Edit item" : "Add item"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {isEdit
            ? "Update the item's details. Quantity only changes through stock movements."
            : "Create a new item and record its opening quantity."}
        </p>
      </div>

      <form
        onSubmit={submit}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        {error && <Alert>{error}</Alert>}
        <Field label="Name" htmlFor="name">
          <input
            id="name"
            className={inputClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </Field>
        <Field label="SKU" htmlFor="sku" hint="Must be unique across all items.">
          <input
            id="sku"
            className={inputClass}
            value={sku}
            onChange={(event) => setSku(event.target.value)}
            required
          />
        </Field>
        <Field label="Location" htmlFor="location">
          <input
            id="location"
            className={inputClass}
            value={location}
            onChange={(event) => setLocation(event.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          {!isEdit && (
            <Field label="Opening quantity" htmlFor="quantity">
              <input
                id="quantity"
                type="number"
                min={0}
                step={1}
                className={inputClass}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </Field>
          )}
          <Field
            label="Reorder level"
            htmlFor="reorder_level"
            hint="Items at or below this quantity are flagged low stock."
          >
            <input
              id="reorder_level"
              type="number"
              min={0}
              step={1}
              className={inputClass}
              value={reorderLevel}
              onChange={(event) => setReorderLevel(event.target.value)}
            />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            to={isEdit && id ? `/items/${id}` : "/"}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
          >
            {busy ? "Saving…" : isEdit ? "Save changes" : "Create item"}
          </button>
        </div>
      </form>
    </div>
  );
}
