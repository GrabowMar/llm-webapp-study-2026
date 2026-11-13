import { useEffect, useState } from "react";
import { api, errorMessage, errorFields } from "./api";
import type { ApiErrors, Item } from "./api";
import { Button, ErrorBanner, Field, FormErrors, inputClass, prevent } from "./ui";

export type ItemFormValues = {
  name: string;
  sku: string;
  location: string;
  quantity: string;
  reorder_level: string;
};

export function emptyForm(): ItemFormValues {
  return {
    name: "",
    sku: "",
    location: "",
    quantity: "0",
    reorder_level: "0",
  };
}

export function formFromItem(item: Item): ItemFormValues {
  return {
    name: item.name,
    sku: item.sku,
    location: item.location,
    quantity: String(item.quantity),
    reorder_level: String(item.reorder_level),
  };
}

export default function ItemForm({
  item,
  onSaved,
  onCancel,
}: {
  item: Item | null;
  onSaved: (item: Item) => void;
  onCancel: () => void;
}) {
  const editing = item !== null;
  const [values, setValues] = useState<ItemFormValues>(() =>
    item ? formFromItem(item) : emptyForm(),
  );
  const [errors, setErrors] = useState<ApiErrors>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setValues(item ? formFromItem(item) : emptyForm());
    setErrors({});
    setError("");
  }, [item]);

  function set(field: keyof ItemFormValues, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  async function submit() {
    setBusy(true);
    setErrors({});
    setError("");
    const payload = {
      name: values.name,
      sku: values.sku,
      location: values.location,
      quantity: Number(values.quantity),
      reorder_level: Number(values.reorder_level),
    };
    try {
      const saved = editing
        ? await api.updateItem(item.id, {
            name: payload.name,
            sku: payload.sku,
            location: payload.location,
            reorder_level: payload.reorder_level,
          })
        : await api.createItem(payload);
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err));
      setErrors(errorFields(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={prevent(submit)} className="space-y-4" noValidate>
      <Field label="Name" name="name" error={errors.name}>
        <input
          id="name"
          name="name"
          className={inputClass}
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </Field>
      <Field label="SKU" name="sku" error={errors.sku}>
        <input
          id="sku"
          name="sku"
          className={inputClass}
          value={values.sku}
          onChange={(e) => set("sku", e.target.value)}
        />
      </Field>
      <Field label="Location" name="location" error={errors.location}>
        <input
          id="location"
          name="location"
          className={inputClass}
          value={values.location}
          onChange={(e) => set("location", e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label={editing ? "Opening quantity (read only)" : "Opening quantity"}
          name="quantity"
          error={errors.quantity}
        >
          <input
            id="quantity"
            name="quantity"
            type="number"
            min="0"
            step="1"
            disabled={editing}
            className={inputClass}
            value={values.quantity}
            onChange={(e) => set("quantity", e.target.value)}
          />
        </Field>
        <Field label="Reorder level" name="reorder_level" error={errors.reorder_level}>
          <input
            id="reorder_level"
            name="reorder_level"
            type="number"
            min="0"
            step="1"
            className={inputClass}
            value={values.reorder_level}
            onChange={(e) => set("reorder_level", e.target.value)}
          />
        </Field>
      </div>
      {editing && (
        <p className="text-xs text-slate-500">
          Quantity changes only through stock movements. Use Receive / Take out on the
          item page.
        </p>
      )}

      <ErrorBanner message={error && Object.keys(errors).length === 0 ? error : ""} />
      <FormErrors
        errors={errors}
        exclude={["name", "sku", "location", "quantity", "reorder_level"]}
      />

      <div className="flex gap-3 pt-1">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : editing ? "Save changes" : "Add item"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
