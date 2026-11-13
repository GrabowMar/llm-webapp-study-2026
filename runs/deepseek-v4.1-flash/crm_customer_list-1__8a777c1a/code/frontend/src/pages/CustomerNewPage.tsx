import { useState } from "react";
import { api, ApiError } from "../api";
import { buttonPrimary, buttonSecondary } from "../ui";
import CustomerFormFields from "../components/CustomerFormFields";
import type { Customer, CustomerInput } from "../types";
import { Link, useNavigate } from "../router";

const emptyInput: CustomerInput = {
  name: "",
  email: "",
  phone: "",
  company: "",
  notes: "",
};

export default function CustomerNewPage() {
  const navigate = useNavigate();
  const [values, setValues] = useState<CustomerInput>(emptyInput);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError("");
    try {
      const created = await api<Customer>("/customers", {
        method: "POST",
        body: values,
      });
      navigate(`/customers/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.errors);
        setFormError(err.message);
      } else {
        setFormError("Could not save the customer.");
      }
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Link to="/" className="text-sm font-medium text-sky-600 hover:text-sky-700">
          ← Back to directory
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">Add customer</h1>
        <p className="mt-1 text-sm text-slate-600">
          Create a new entry in the shared directory.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        noValidate
      >
        {formError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {formError}
          </div>
        ) : null}

        <CustomerFormFields values={values} errors={errors} onChange={setValues} />

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
          <Link to="/" className={buttonSecondary}>
            Cancel
          </Link>
          <button type="submit" className={buttonPrimary} disabled={busy}>
            {busy ? "Saving…" : "Create customer"}
          </button>
        </div>
      </form>
    </div>
  );
}
