import { ReactNode } from "react";

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm " +
  "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

export function TextInput({
  label,
  ...props
}: {
  label: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label}>
      <input className={inputCls} {...props} />
    </Field>
  );
}

export function SelectInput({
  label,
  children,
  ...props
}: {
  label: string;
  children: ReactNode;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Field label={label}>
      <select className={inputCls} {...props}>
        {children}
      </select>
    </Field>
  );
}

export function TextArea({
  label,
  ...props
}: {
  label: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field label={label}>
      <textarea className={inputCls} rows={3} {...props} />
    </Field>
  );
}

export function Button({
  variant = "primary",
  ...props
}: {
  variant?: "primary" | "danger" | "secondary";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants = {
    primary:
      "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300",
    danger: "bg-red-600 text-white hover:bg-red-700",
    secondary:
      "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
  };
  return (
    <button
      className={`rounded-md px-4 py-2 text-sm font-medium transition ${variants[variant]} disabled:cursor-not-allowed`}
      {...props}
    />
  );
}

export function Card({
  title,
  children,
  actions,
}: {
  title?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      {(title || actions) && (
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h2 className="text-base font-semibold text-gray-800">{title}</h2>
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}

export function SuccessBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
      {message}
    </div>
  );
}

export function Spinner() {
  return <div className="py-8 text-center text-sm text-gray-500">Loading…</div>;
}
