import { useCallback, useEffect, useState } from "react";
import { ApiError, OPTIONS, api, type Option, type Page, type Question } from "../api";

interface Props {
  onUnauthorized: () => void;
}

const PAGE_SIZE = 10;

const EMPTY = {
  text: "",
  option_a: "",
  option_b: "",
  option_c: "",
  option_d: "",
  correct_option: "A" as Option,
};

type Field = "text" | "option_a" | "option_b" | "option_c" | "option_d";

export default function Admin({ onUnauthorized }: Props) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<Question> | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const handleError = useCallback(
    (err: unknown, set: (m: string) => void) => {
      if (err instanceof ApiError && err.status === 401) onUnauthorized();
      else set(err instanceof ApiError ? err.message : "Something went wrong");
    },
    [onUnauthorized],
  );

  const load = useCallback(
    (p: number) => {
      setListError(null);
      api
        .questions(p, PAGE_SIZE)
        .then(setData)
        .catch((err) => handleError(err, setListError));
    },
    [handleError],
  );

  useEffect(() => load(page), [load, page]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    setSuccess(null);
    try {
      const q = await api.createQuestion(form);
      setForm(EMPTY);
      setSuccess(`Question #${q.id} added.`);
      const total = (data?.total ?? 0) + 1;
      const last = Math.max(1, Math.ceil(total / PAGE_SIZE));
      if (last === page) load(page);
      else setPage(last);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.errors);
      }
      handleError(err, setFormError);
    } finally {
      setBusy(false);
    }
  }

  const input = (field: string) =>
    `mt-1 w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
      errors[field] ? "border-red-400" : "border-slate-300"
    }`;

  const fieldLabels: [Field, string][] = [
    ["option_a", "Option A"],
    ["option_b", "Option B"],
    ["option_c", "Option C"],
    ["option_d", "Option D"],
  ];

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-xl bg-white p-6 shadow">
        <h2 className="mb-4 text-xl font-semibold">Add question</h2>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Question</span>
            <textarea
              className={input("text")}
              rows={2}
              value={form.text}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
            />
            {errors.text && <span className="mt-1 block text-sm text-red-600">{errors.text}</span>}
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            {fieldLabels.map(([field, label]) => (
              <label key={field} className="block">
                <span className="text-sm font-medium text-slate-700">{label}</span>
                <input
                  className={input(field)}
                  value={form[field]}
                  onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                />
                {errors[field] && (
                  <span className="mt-1 block text-sm text-red-600">{errors[field]}</span>
                )}
              </label>
            ))}
          </div>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Correct option</span>
            <select
              className={input("correct_option")}
              value={form.correct_option}
              onChange={(e) => setForm({ ...form, correct_option: e.target.value as Option })}
            >
              {OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            {errors.correct_option && (
              <span className="mt-1 block text-sm text-red-600">{errors.correct_option}</span>
            )}
          </label>
          {formError && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}
          {success && (
            <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{success}</p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-indigo-600 px-5 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Add question"}
          </button>
        </form>
      </div>

      <div className="rounded-xl bg-white p-6 shadow">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Questions</h2>
          {data && <span className="text-sm text-slate-500">{data.total} total</span>}
        </div>
        {listError && <p className="mb-3 text-sm text-red-600">{listError}</p>}
        {!data && !listError && <p className="text-slate-500">Loading…</p>}
        {data && (
          <>
            <ul className="divide-y divide-slate-100">
              {data.items.map((q) => (
                <li key={q.id} className="py-3">
                  <p className="font-medium">
                    <span className="text-slate-400">#{q.id}</span> {q.text}
                  </p>
                  <ul className="mt-1 grid gap-1 text-sm sm:grid-cols-2">
                    {OPTIONS.map((o) => {
                      const text = q[`option_${o.toLowerCase()}` as Field];
                      const ok = o === q.correct_option;
                      return (
                        <li key={o} className={ok ? "font-medium text-green-700" : "text-slate-600"}>
                          {o}. {text} {ok && "✓"}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between text-sm">
              <button
                type="button"
                className="rounded-md px-3 py-1 hover:bg-slate-100 disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                ← Previous
              </button>
              <span className="text-slate-500">
                Page {data.page} of {totalPages}
              </span>
              <button
                type="button"
                className="rounded-md px-3 py-1 hover:bg-slate-100 disabled:opacity-40"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
