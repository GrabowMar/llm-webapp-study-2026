import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { btnCls, btnSecondaryCls, ErrorBanner, Field, inputCls } from "../ui";

export default function ItemForm() {
  const { id } = useParams();
  const editing = id !== undefined;
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    sku: "",
    location: "",
    reorder_level: "0",
    quantity: "0",
  });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(!editing);

  useEffect(() => {
    if (!editing) return;
    api
      .getItem(id)
      .then((it) => {
        setForm({
          name: it.name,
          sku: it.sku,
          location: it.location,
          reorder_level: String(it.reorder_level),
          quantity: String(it.quantity),
        });
        setLoaded(true);
      })
      .catch((e) => setError(e.message));
  }, [id, editing]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setFields({});
    try {
      if (editing) {
        const it = await api.updateItem(Number(id), form);
        navigate(`/items/${it.id}`);
      } else {
        const it = await api.createItem(form);
        navigate(`/items/${it.id}`);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setFields(err.fields);
        setError(Object.keys(err.fields).length ? "" : err.message);
      } else setError("Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-lg space-y-4 rounded bg-white p-6 shadow">
      <h1 className="text-xl font-semibold">{editing ? "Edit item" : "Add item"}</h1>
      <ErrorBanner message={error} />
      <Field label="Name" htmlFor="name" error={fields.name}>
        <input id="name" className={inputCls} value={form.name} onChange={set("name")} />
      </Field>
      <Field label="SKU" htmlFor="sku" error={fields.sku}>
        <input id="sku" className={inputCls} value={form.sku} onChange={set("sku")} />
      </Field>
      <Field label="Location" htmlFor="location" error={fields.location}>
        <input id="location" className={inputCls} value={form.location} onChange={set("location")} />
      </Field>
      {!editing && (
        <Field label="Opening quantity" htmlFor="quantity" error={fields.quantity}>
          <input
            id="quantity"
            inputMode="numeric"
            className={inputCls}
            value={form.quantity}
            onChange={set("quantity")}
          />
        </Field>
      )}
      <Field label="Reorder level" htmlFor="reorder_level" error={fields.reorder_level}>
        <input
          id="reorder_level"
          inputMode="numeric"
          className={inputCls}
          value={form.reorder_level}
          onChange={set("reorder_level")}
        />
      </Field>
      <div className="flex gap-2">
        <button type="submit" className={btnCls} disabled={busy || !loaded}>
          {editing ? "Save changes" : "Add item"}
        </button>
        <Link to={editing ? `/items/${id}` : "/"} className={btnSecondaryCls}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
