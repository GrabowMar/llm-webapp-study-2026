import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ApiError, api, type CustomerInput } from "../api";
import AppShell from "../components/AppShell";
import { Alert, Button, Spinner, TextAreaField, TextField } from "../components/ui";

const EMPTY: CustomerInput = { name: "", email: "", phone: "", company: "", notes: "" };

export default function CustomerFormPage({ mode }: { mode: "create" | "edit" }) {
  const { id } = useParams();
  const customerId = Number(id);
  const navigate = useNavigate();
  const isEdit = mode === "edit";

  const [values, setValues] = useState<CustomerInput>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    api
      .getCustomer(customerId)
      .then((customer) => {
        if (cancelled) return;
        setValues({
          name: customer.name ?? "",
          email: customer.email ?? "",
          phone: customer.phone ?? "",
          company: customer.company ?? "",
          notes: customer.notes ?? "",
        });
      })
      .catch(() => {
        if (!cancelled) setFormError("This customer could not be loaded. Please try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isEdit, customerId]);

  function update(field: keyof CustomerInput, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    if (!values.name.trim()) {
      setFieldErrors({ name: "Name is required." });
      return;
    }
    setSaving(true);
    const payload: CustomerInput = {
      name: values.name.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      company: values.company.trim(),
      notes: values.notes.trim(),
    };
    try {
      const customer = isEdit
        ? await api.updateCustomer(customerId, payload)
        : await api.createCustomer(payload);
      navigate(`/customers/${customer.id}`, { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFormError(caught.message);
        setFieldErrors(caught.fields);
      } else {
        setFormError("The customer could not be saved. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <Spinner label="Loading customer" />
      </AppShell>
    );
  }

  const cancelTo = isEdit ? `/customers/${customerId}` : "/customers";

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-5">
        <div>
          <Link to={cancelTo} className="text-sm font-medium text-indigo-700 hover:underline">
            ← Cancel
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
            {isEdit ? "Edit customer" : "Add customer"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {isEdit
              ? "Update the contact details. Empty fields are cleared."
              : "Only the name is required. Every team member will see this record."}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          {formError ? (
            <Alert tone="error">
              {formError}
              {fieldErrors.email ? (
                <span className="mt-1 block">{fieldErrors.email}</span>
              ) : null}
            </Alert>
          ) : null}

          <TextField
            label="Name"
            name="name"
            value={values.name}
            onChange={(value) => update("name", value)}
            error={fieldErrors.name}
            placeholder="Jane Doe"
            required
          />
          <TextField
            label="Email"
            name="email"
            type="email"
            value={values.email}
            onChange={(value) => update("email", value)}
            error={fieldErrors.email}
            placeholder="jane@example.com"
          />
          <TextField
            label="Phone"
            name="phone"
            value={values.phone}
            onChange={(value) => update("phone", value)}
            error={fieldErrors.phone}
            placeholder="+1 555 0100"
          />
          <TextField
            label="Company"
            name="company"
            value={values.company}
            onChange={(value) => update("company", value)}
            error={fieldErrors.company}
            placeholder="Acme Corp"
          />
          <TextAreaField
            label="Notes"
            name="notes"
            value={values.notes}
            onChange={(value) => update("notes", value)}
            error={fieldErrors.notes}
            placeholder="Anything the team should know about this customer."
            rows={4}
          />

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Add customer"}
            </Button>
            <Link
              to={cancelTo}
              className="text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
