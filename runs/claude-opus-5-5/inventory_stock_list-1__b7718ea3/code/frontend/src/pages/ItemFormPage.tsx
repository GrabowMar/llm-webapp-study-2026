import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { api, ApiError, type ItemInput } from "../api";
import { useAuth } from "../auth";
import { Link, navigate } from "../router";
import { Alert, Button, Card, Field, Input, Spinner } from "../components/ui";

interface FormState {
  name: string;
  sku: string;
  location: string;
  reorder_level: string;
  quantity: string;
}

const empty: FormState = { name: "", sku: "", location: "", reorder_level: "0", quantity: "0" };

function toNumber(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function ItemFormPage({ itemId }: { itemId?: number }) {
  const { username } = useAuth();
  const isEdit = itemId !== undefined;
  const [form, setForm] = useState<FormState>(empty);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    api
      .getItem(itemId)
      .then((it) =>
        setForm({
          name: it.name,
          sku: it.sku,
          location: it.location,
          reorder_level: String(it.reorder_level),
          quantity: String(it.quantity),
        }),
      )
      .catch((e) => setLoadError(e instanceof ApiError ? e.message : "Failed to load item"))
      .finally(() => setLoading(false));
  }, [isEdit, itemId]);

  if (!username) {
    return (
      <div className="mx-auto max-w-lg pt-8">
        <Alert kind="info">
          Please{" "}
          <Link href="/login" className="font-semibold underline">
            sign in
          </Link>{" "}
          to {isEdit ? "edit" : "add"} items.
        </Alert>
      </div>
    );
  }

  if (loading) return <Spinner />;
  if (loadError) return <Alert>{loadError}</Alert>;

  const set = (k: keyof FormState) => (e: ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (fieldErrors[k]) setFieldErrors(({ [k]: _omit, ...rest }) => rest);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const payload: ItemInput = {
      name: form.name,
      sku: form.sku,
      location: form.location,
      reorder_level: toNumber(form.reorder_level),
    };
    if (!isEdit) payload.quantity = toNumber(form.quantity);
    try {
      const saved = isEdit ? await api.updateItem(itemId, payload) : await api.createItem(payload);
      navigate(`/items/${saved.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.fieldErrors);
      } else {
        setError("Failed to save item");
      }
      setBusy(false);
    }
  };

  const cancelHref = isEdit ? `/items/${itemId}` : "/";

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href={cancelHref} className="text-sm text-slate-500 hover:text-indigo-600">
        ← {isEdit ? "Back to item" : "Back to inventory"}
      </Link>
      <Card className="p-6">
        <h1 className="mb-5 text-xl font-bold">{isEdit ? "Edit item" : "Add item"}</h1>
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <Alert>{error}</Alert>}
          <Field label="Name" htmlFor="name" error={fieldErrors.name}>
            <Input id="name" name="name" value={form.name} onChange={set("name")} invalid={!!fieldErrors.name} autoFocus />
          </Field>
          <Field label="SKU" htmlFor="sku" error={fieldErrors.sku}>
            <Input id="sku" name="sku" value={form.sku} onChange={set("sku")} invalid={!!fieldErrors.sku} className="font-mono" />
          </Field>
          <Field label="Location" htmlFor="location" error={fieldErrors.location} hint="e.g. Aisle 3, Shelf B">
            <Input id="location" name="location" value={form.location} onChange={set("location")} invalid={!!fieldErrors.location} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            {isEdit ? (
              <Field label="Quantity" htmlFor="quantity" hint="Change quantity with Receive / Take out">
                <Input id="quantity" value={form.quantity} disabled readOnly className="bg-slate-100 text-slate-500" />
              </Field>
            ) : (
              <Field label="Opening quantity" htmlFor="quantity" error={fieldErrors.quantity}>
                <Input
                  id="quantity"
                  name="quantity"
                  type="number"
                  min={0}
                  step={1}
                  value={form.quantity}
                  onChange={set("quantity")}
                  invalid={!!fieldErrors.quantity}
                />
              </Field>
            )}
            <Field label="Reorder level" htmlFor="reorder_level" error={fieldErrors.reorder_level}>
              <Input
                id="reorder_level"
                name="reorder_level"
                type="number"
                min={0}
                step={1}
                value={form.reorder_level}
                onChange={set("reorder_level")}
                invalid={!!fieldErrors.reorder_level}
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => navigate(cancelHref)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : isEdit ? "Save changes" : "Add item"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
