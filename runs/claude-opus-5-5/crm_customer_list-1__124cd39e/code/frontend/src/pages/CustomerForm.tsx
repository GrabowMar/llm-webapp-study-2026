import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type Customer, type CustomerInput, type FieldErrors } from "../api";
import { Alert, Button, Card, Field, Link, Spinner, TextArea, TextInput, buttonClass } from "../components/ui";
import { navigate } from "../router";

const empty: CustomerInput = { name: "", email: "", phone: "", company: "", notes: "" };

function toInput(c: Customer): CustomerInput {
  return {
    name: c.name,
    email: c.email ?? "",
    phone: c.phone ?? "",
    company: c.company ?? "",
    notes: c.notes ?? "",
  };
}

export default function CustomerForm({ id }: { id?: number }) {
  const editing = id !== undefined;
  const [values, setValues] = useState<CustomerInput>(empty);
  const [loading, setLoading] = useState(editing);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id === undefined) return;
    let cancelled = false;
    setLoading(true);
    api
      .getCustomer(id)
      .then((c) => {
        if (!cancelled) setValues(toInput(c));
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : "Could not load customer.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  function set<K extends keyof CustomerInput>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    if (fieldErrors[key]) setFieldErrors(({ [key]: _removed, ...rest }) => rest);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setFieldErrors({});
    try {
      const saved = editing ? await api.updateCustomer(id, values) : await api.createCustomer(values);
      navigate(`/customers/${saved.id}`, !editing);
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.errors);
        setError(Object.keys(err.errors).length ? "Please fix the highlighted fields." : err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  const cancelTo = editing ? `/customers/${id}` : "/";

  if (loading) return <Spinner />;
  if (loadError)
    return (
      <div className="space-y-4">
        <Alert>{loadError}</Alert>
        <Link to="/" className={buttonClass("secondary")}>
          Back to customers
        </Link>
      </div>
    );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link to={cancelTo} className="text-sm text-slate-500 hover:text-slate-700">
          ← {editing ? "Back to customer" : "Back to customers"}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{editing ? "Edit customer" : "Add customer"}</h1>
      </div>

      <Card className="p-6">
        <form className="space-y-5" onSubmit={submit} noValidate>
          {error && <Alert>{error}</Alert>}
          <Field label="Name *" htmlFor="name" error={fieldErrors.name}>
            <TextInput id="name" value={values.name} onChange={(e) => set("name", e.target.value)} error={fieldErrors.name} autoFocus required />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Email" htmlFor="email" error={fieldErrors.email}>
              <TextInput id="email" type="email" value={values.email} onChange={(e) => set("email", e.target.value)} error={fieldErrors.email} />
            </Field>
            <Field label="Phone" htmlFor="phone" error={fieldErrors.phone}>
              <TextInput id="phone" type="tel" value={values.phone} onChange={(e) => set("phone", e.target.value)} error={fieldErrors.phone} />
            </Field>
          </div>
          <Field label="Company" htmlFor="company" error={fieldErrors.company}>
            <TextInput id="company" value={values.company} onChange={(e) => set("company", e.target.value)} error={fieldErrors.company} />
          </Field>
          <Field label="Notes" htmlFor="notes" error={fieldErrors.notes}>
            <TextArea id="notes" rows={5} value={values.notes} onChange={(e) => set("notes", e.target.value)} error={fieldErrors.notes} />
          </Field>
          <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
            <Link to={cancelTo} className={buttonClass("secondary")}>
              Cancel
            </Link>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Add customer"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
