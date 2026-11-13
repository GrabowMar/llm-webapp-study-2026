import { FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, LETTERS, Question, api } from "../api";
import { btnPrimary, btnSecondary, cardCls, inputCls } from "../ui";

interface Page {
  items: Question[];
  total: number;
  page: number;
  page_size: number;
}

const PAGE_SIZE = 10;
const empty = { text: "", option_a: "", option_b: "", option_c: "", option_d: "", correct_option: "A" };

export default function AdminView({ onExpired }: { onExpired: () => void }) {
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(
    async (p: number) => {
      try {
        setData(await api<Page>(`/admin/questions?page=${p}&page_size=${PAGE_SIZE}`));
        setLoadError(null);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) onExpired();
        else setLoadError(e instanceof Error ? e.message : "Something went wrong");
      }
    },
    [onExpired],
  );

  useEffect(() => {
    load(page);
  }, [load, page]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage(null);
    setSuccess(null);
    try {
      await api("/admin/questions", { method: "POST", body: form });
      setForm(empty);
      setSuccess("Question added");
      await load(page);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) return onExpired();
        setErrors(err.errors);
        if (!Object.keys(err.errors).length) setMessage(err.message);
      } else setMessage("Something went wrong");
    }
    setBusy(false);
  };

  const fieldErr = (k: string) =>
    errors[k] ? <p className="mt-1 text-sm text-red-600">{errors[k]}</p> : null;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className={`${cardCls} space-y-3`} aria-label="Add question">
        <h2 className="text-xl font-bold">Add question</h2>
        <div>
          <label htmlFor="q-text" className="mb-1 block text-sm font-medium">Question</label>
          <input id="q-text" className={inputCls} value={form.text} onChange={(e) => set("text", e.target.value)} />
          {fieldErr("text")}
        </div>
        {LETTERS.map((l) => {
          const k = `option_${l.toLowerCase()}`;
          return (
            <div key={k}>
              <label htmlFor={`q-${k}`} className="mb-1 block text-sm font-medium">Option {l}</label>
              <input
                id={`q-${k}`}
                className={inputCls}
                value={(form as Record<string, string>)[k]}
                onChange={(e) => set(k, e.target.value)}
              />
              {fieldErr(k)}
            </div>
          );
        })}
        <div>
          <label htmlFor="q-correct" className="mb-1 block text-sm font-medium">Correct option</label>
          <select
            id="q-correct"
            className={inputCls}
            value={form.correct_option}
            onChange={(e) => set("correct_option", e.target.value)}
          >
            {LETTERS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          {fieldErr("correct_option")}
        </div>
        {message && <p role="alert" className="text-sm text-red-600">{message}</p>}
        {success && <p role="status" className="text-sm text-green-700">{success}</p>}
        <button type="submit" disabled={busy} className={btnPrimary}>Add question</button>
      </form>

      <section className={cardCls}>
        <h2 className="mb-4 text-xl font-bold">Questions {data && `(${data.total})`}</h2>
        {loadError && <p role="alert" className="text-red-600">{loadError}</p>}
        <ul className="space-y-3">
          {data?.items.map((q) => (
            <li key={q.id} className="rounded border border-slate-200 p-3 text-sm">
              <p className="font-semibold">{q.id}. {q.text}</p>
              <ul className="mt-1 grid gap-1 sm:grid-cols-2">
                {LETTERS.map((l) => (
                  <li key={l} className={q.correct_option === l ? "font-semibold text-green-700" : ""}>
                    {l}. {q[`option_${l.toLowerCase()}` as "option_a"]}
                    {q.correct_option === l && " (correct)"}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-center justify-between">
          <button className={btnSecondary} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="text-sm text-slate-600">Page {page} of {pages}</span>
          <button className={btnSecondary} disabled={page >= pages} onClick={() => setPage(page + 1)}>Next page</button>
        </div>
      </section>
    </div>
  );
}
