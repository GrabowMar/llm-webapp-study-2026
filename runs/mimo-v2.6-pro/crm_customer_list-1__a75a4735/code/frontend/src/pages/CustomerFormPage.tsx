import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, createCustomer, getCustomer, updateCustomer } from "../api";
import type { CustomerPayload } from "../types";
import { Alert, Button, Card, Field, Spinner, TextArea, TextInput } from "../ui";

export default function CustomerFormPage() {
  const { id } = useParams();
  const customerId = id ? Number(id) : null;
  const editing = customerId !== null;
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(editing);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    setLoading(true);
    getCustomer(customerId)
      .then((customer) => {
        if (cancelled) return;
        setName(customer.name);
        setEmail(customer.email ?? "");
        setPhone(customer.phone ?? "");
        setCompany(customer.company ?? "");
        setNotes(customer.notes ?? "");
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load customer");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId, editing]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSaving(true);
    const payload: CustomerPayload = {
      name,
      email: email.trim() || null,
      phone: phone.trim() || null,
      company: company.trim() || null,
      notes: notes.trim() || null,
    };
    try {
      const saved = editing
        ? await updateCustomer(customerId, payload)
        : await createCustomer(payload);
      navigate(`/customers/${saved.id}`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err : new ApiError(0, "Saving failed"));
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Link to={editing ? `/customers/${customerId}` : "/customers"} className="text-sm text-indigo-600 hover:underline">
          &larr; Back
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">
          {editing ? "Edit customer" : "Add customer"}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {editing
            ? "Update the customer's details. Fields left empty are cleared."
            : "Add a new customer to the shared directory. Only the name is required."}
        </p>
      </div>

      {loadError ? <Alert>{loadError}</Alert> : null}

      <Card>
        <form onSubmit={handleSubmit} className="space-y-5">
          {formError ? <Alert>{formError.message}</Alert> : null}
          <Field label="Name" error={formError?.fields.name}>
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              required
            />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Email" error={formError?.fields.email}>
              <TextInput
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </Field>
            <Field label="Phone" error={formError?.fields.phone}>
              <TextInput
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 0100"
              />
            </Field>
          </div>
          <Field label="Company" error={formError?.fields.company}>
            <TextInput
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Company name"
            />
          </Field>
          <Field label="Notes" error={formError?.fields.notes}>
            <TextArea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything the team should know about this customer"
            />
          </Field>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Add customer"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate(editing ? `/customers/${customerId}` : "/customers")}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
