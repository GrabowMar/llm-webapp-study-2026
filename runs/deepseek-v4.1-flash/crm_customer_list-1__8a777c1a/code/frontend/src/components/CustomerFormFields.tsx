import type { CustomerInput } from "../types";
import { FieldError, inputClass, labelClass } from "../ui";

export default function CustomerFormFields({
  values,
  errors,
  onChange,
}: {
  values: CustomerInput;
  errors: Record<string, string>;
  onChange: (next: CustomerInput) => void;
}) {
  function set<K extends keyof CustomerInput>(key: K, value: CustomerInput[K]) {
    onChange({ ...values, [key]: value });
  }

  return (
    <div className="space-y-4">
      <div>
        <label className={labelClass} htmlFor="name">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          id="name"
          className={inputClass}
          value={values.name}
          onChange={(event) => set("name", event.target.value)}
          autoComplete="off"
        />
        <FieldError message={errors.name} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            className={inputClass}
            value={values.email}
            onChange={(event) => set("email", event.target.value)}
            autoComplete="off"
          />
          <FieldError message={errors.email} />
        </div>
        <div>
          <label className={labelClass} htmlFor="phone">
            Phone
          </label>
          <input
            id="phone"
            className={inputClass}
            value={values.phone}
            onChange={(event) => set("phone", event.target.value)}
            autoComplete="off"
          />
          <FieldError message={errors.phone} />
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="company">
          Company
        </label>
        <input
          id="company"
          className={inputClass}
          value={values.company}
          onChange={(event) => set("company", event.target.value)}
          autoComplete="off"
        />
        <FieldError message={errors.company} />
      </div>

      <div>
        <label className={labelClass} htmlFor="notes">
          Notes
        </label>
        <textarea
          id="notes"
          className={`${inputClass} min-h-28 resize-y`}
          value={values.notes}
          onChange={(event) => set("notes", event.target.value)}
        />
        <FieldError message={errors.notes} />
      </div>
    </div>
  );
}
