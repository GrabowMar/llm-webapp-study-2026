import { useEffect } from "react";
import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { errorMessage } from "../api";
import { useAuth } from "../auth";
import type { Item } from "../types";
import { cardClass } from "../ui";
import { ErrorAlert } from "../ui";
import { inputClass } from "../ui";
import { labelClass } from "../ui";
import { primaryButtonClass } from "../ui";
import { secondaryButtonClass } from "../ui";

function numberOrUndefined(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  return Number(value);
}

export default function ItemFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const isEdit = Boolean(id);

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [location, setLocation] = useState("");
  const [reorderLevel, setReorderLevel] = useState("");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    api<Item>(`/api/items/${id}`)
      .then((item) => {
        if (cancelled) return;
        setName(item.name);
        setSku(item.sku);
        setLocation(item.location);
        setReorderLevel(String(item.reorder_level));
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof Error && "status" in err && (err as { status: number }).status === 404) {
          setMissing(true);
        } else {
          setError(errorMessage(err));
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const payload: Record<string, unknown> = { name, sku, location };
    const reorder = numberOrUndefined(reorderLevel);
    if (reorder !== undefined) payload.reorder_level = reorder;
    if (!isEdit) {
      const opening = numberOrUndefined(quantity);
      if (opening !== undefined) payload.quantity = opening;
    }

    try {
      const saved = isEdit
        ? await api<Item>(`/api/items/${id}`, { method: "PUT", body: payload })
        : await api<Item>("/api/items", { method: "POST", body: payload });
      navigate(`/items/${saved.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className={`${cardClass} mx-auto max-w-md text-center`}>
        <h1 className="mb-2 text-xl font-semibold">Sign in required</h1>
        <p className="mb-4 text-slate-600">You need to be signed in to add or edit items.</p>
        <Link to="/account" className={primaryButtonClass}>
          Go to sign in
        </Link>
      </div>
    );
  }

  if (missing) {
    return (
      <div className={`${cardClass} mx-auto max-w-md text-center`}>
        <h1 className="mb-2 text-xl font-semibold">Item not found</h1>
        <p className="mb-4 text-slate-600">This item may have been deleted.</p>
        <Link to="/" className={primaryButtonClass}>
          Back to inventory
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">{isEdit ? "Edit item" : "Add item"}</h1>
      <form onSubmit={handleSubmit} className={`${cardClass} space-y-4`}>
        {loading ? (
          <p className="text-sm text-slate-500">Loading item…</p>
        ) : (
          <>
            <div>
              <label htmlFor="item-name" className={labelClass}>
                Name
              </label>
              <input
                id="item-name"
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="item-sku" className={labelClass}>
                SKU
              </label>
              <input
                id="item-sku"
                className={inputClass}
                value={sku}
                onChange={(e) => setSku(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="item-location" className={labelClass}>
                Location
              </label>
              <input
                id="item-location"
                className={inputClass}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="item-reorder-level" className={labelClass}>
                Reorder level
              </label>
              <input
                id="item-reorder-level"
                type="number"
                min="0"
                step="1"
                className={inputClass}
                value={reorderLevel}
                onChange={(e) => setReorderLevel(e.target.value)}
              />
            </div>
            {isEdit ? (
              <p className="text-sm text-slate-500">
                The quantity is not edited here — it only changes through stock movements.
              </p>
            ) : (
              <div>
                <label htmlFor="item-quantity" className={labelClass}>
                  Opening quantity
                </label>
                <input
                  id="item-quantity"
                  type="number"
                  min="0"
                  step="1"
                  className={inputClass}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
            )}
            <ErrorAlert message={error} />
            <div className="flex gap-3">
              <button type="submit" className={primaryButtonClass} disabled={busy || loading}>
                {isEdit ? "Save changes" : "Add item"}
              </button>
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => navigate(isEdit ? `/items/${id}` : "/")}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
