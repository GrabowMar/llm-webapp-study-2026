import { useState } from "react";
import * as api from "./api";
import { Button, ErrorBanner, Field, TextArea, TextInput } from "./components";
import type { Customer, CustomerInput, FieldErrors } from "./types";
import { errorParts } from "./utils";

const empty: CustomerInput = {
  name: "",
  email: "",
  phone: "",
  company: "",
  notes: "",
};

function fromCustomer(c: Customer): CustomerInput {
  return {
    name: c.name,
    email: c.email,
    phone: c.phone,
    company: c.company,
    notes: c.notes,
  };
}

export default function CustomerForm({
  customer,
  onSaved,
  onCancel,
}: {
  customer?: Customer;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<CustomerInput>(
    customer ? fromCustomer(customer) : empty,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  function set(field: keyof CustomerInput, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    setErrors({});
    try {
      if (customer) await api.updateCustomer(customer.id, values);
      else await api.createCustomer(values);
      onSaved();
    } catch (err) {
      const parts = errorParts(err);
      setMessage(parts.message);
      setErrors(parts.errors);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorBanner message={message} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name *" name="name" errors={errors}>
          <TextInput
            id="name"
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            invalid={!!errors.name}
            placeholder="Jane Doe"
          />
        </Field>
        <Field label="Email *" name="email" errors={errors}>
          <TextInput
            id="email"
            type="email"
            value={values.email}
            onChange={(e) => set("email", e.target.value)}
            invalid={!!errors.email}
            placeholder="jane@example.com"
          />
        </Field>
        <Field label="Phone" name="phone" errors={errors}>
          <TextInput
            id="phone"
            value={values.phone}
            onChange={(e) => set("phone", e.target.value)}
            invalid={!!errors.phone}
            placeholder="+1 555 0100"
          />
        </Field>
        <Field label="Company" name="company" errors={errors}>
          <TextInput
            id="company"
            value={values.company}
            onChange={(e) => set("company", e.target.value)}
            invalid={!!errors.company}
            placeholder="Acme Inc."
          />
        </Field>
      </div>
      <Field label="Notes" name="notes" errors={errors}>
        <TextArea
          id="notes"
          rows={3}
          value={values.notes}
          onChange={(e) => set("notes", e.target.value)}
          invalid={!!errors.notes}
          placeholder="Anything worth remembering…"
        />
      </Field>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : customer ? "Save changes" : "Add customer"}
        </Button>
      </div>
    </form>
  );
}
