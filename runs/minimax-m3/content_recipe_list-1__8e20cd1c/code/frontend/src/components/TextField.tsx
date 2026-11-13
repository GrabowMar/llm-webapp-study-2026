interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
  placeholder?: string;
  hint?: string;
  min?: number;
  list?: string;
  inputClassName?: string;
}

export default function TextField({
  id,
  label,
  value,
  onChange,
  error,
  type = "text",
  placeholder,
  hint,
  min,
  list,
  inputClassName = "",
}: TextFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-stone-700">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        min={min}
        list={list}
        value={value}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={`rounded-lg border px-3 py-2 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-amber-600 focus:ring-2 focus:ring-amber-200 ${
          error ? "border-red-400 bg-red-50" : "border-stone-300 bg-white"
        } ${inputClassName}`}
      />
      {hint && !error ? <p className="text-xs text-stone-500">{hint}</p> : null}
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
