import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../api";
import type {
  Option,
  PaginatedQuestions,
  Question,
  QuestionInput,
} from "../types";
import { OPTION_KEYS, optionText } from "../types";

const EMPTY: QuestionInput = {
  text: "",
  option_a: "",
  option_b: "",
  option_c: "",
  option_d: "",
  correct_option: "A",
};

const PAGE_SIZE = 10;

export default function AdminView({ refreshKey }: { refreshKey: number }) {
  const [form, setForm] = useState<QuestionInput>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedQuestions | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const loadQuestions = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const result = await api<PaginatedQuestions>(
        `/api/admin/questions?page=${page}&page_size=${PAGE_SIZE}`,
      );
      setData(result);
    } catch (err) {
      setListError((err as Error).message);
    } finally {
      setListLoading(false);
    }
  }, [page]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions, refreshKey, reloadKey]);

  function update<K extends keyof QuestionInput>(key: K, value: QuestionInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    setSuccess(null);
    setFieldErrors({});
    try {
      const created = await api<Question>("/api/admin/questions", {
        method: "POST",
        body: form,
      });
      setSuccess(`Question ${created.id} added.`);
      setForm(EMPTY);
      setPage(1);
      setReloadKey((value) => value + 1);
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.errors);
        setFormError(err.errors && Object.keys(err.errors).length ? null : err.message);
      } else {
        setFormError((err as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-xl font-bold text-slate-900">Add question</h2>
        <p className="mt-1 text-sm text-slate-500">
          Questions become available for random quizzes right away.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div>
            <label
              htmlFor="q-text"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Question text
            </label>
            <textarea
              id="q-text"
              className={`${inputClass} min-h-20 resize-y`}
              value={form.text}
              onChange={(event) => update("text", event.target.value)}
            />
            {fieldErrors.text && (
              <p className="mt-1 text-sm text-rose-600">{fieldErrors.text}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {OPTION_KEYS.map((option) => {
              const key = `option_${option.toLowerCase()}` as
                | "option_a"
                | "option_b"
                | "option_c"
                | "option_d";
              return (
                <div key={option}>
                  <label
                    htmlFor={`q-option-${option.toLowerCase()}`}
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Option {option}
                  </label>
                  <input
                    id={`q-option-${option.toLowerCase()}`}
                    className={inputClass}
                    value={form[key]}
                    onChange={(event) => update(key, event.target.value)}
                  />
                  {fieldErrors[key] && (
                    <p className="mt-1 text-sm text-rose-600">
                      {fieldErrors[key]}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div>
            <label
              htmlFor="q-correct"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Correct option
            </label>
            <select
              id="q-correct"
              className={`${inputClass} sm:max-w-40`}
              value={form.correct_option}
              onChange={(event) =>
                update("correct_option", event.target.value as Option)
              }
            >
              {OPTION_KEYS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {fieldErrors.correct_option && (
              <p className="mt-1 text-sm text-rose-600">
                {fieldErrors.correct_option}
              </p>
            )}
          </div>

          {formError && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {formError}
            </div>
          )}
          {success && (
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-6 py-2.5 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Adding…" : "Add question"}
          </button>
        </form>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">All questions</h2>
          {data && (
            <span className="text-sm text-slate-500">{data.total} total</span>
          )}
        </div>

        {listLoading && !data ? (
          <p className="py-10 text-center text-slate-500">Loading questions…</p>
        ) : listError ? (
          <div className="rounded-xl bg-rose-50 px-4 py-3 text-rose-700">
            {listError}
          </div>
        ) : data && data.items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-slate-500">
            No questions yet.
          </div>
        ) : (
          <div className="space-y-3">
            {data?.items.map((question) => (
              <article
                key={question.id}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <h3 className="font-semibold text-slate-900">
                    <span className="mr-2 text-slate-400">#{question.id}</span>
                    {question.text}
                  </h3>
                  <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                    {question.correct_option}
                  </span>
                </div>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {OPTION_KEYS.map((option) => (
                    <li
                      key={option}
                      className={`rounded-lg px-3 py-1.5 text-sm ${
                        question.correct_option === option
                          ? "bg-emerald-50 font-medium text-emerald-800"
                          : "bg-slate-50 text-slate-600"
                      }`}
                    >
                      <span className="mr-2 font-bold">{option}.</span>
                      {optionText(question, option)}
                    </li>
                  ))}
                </ul>
              </article>
            ))}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-slate-500">
                Page {data?.page ?? page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() =>
                  setPage((value) => Math.min(totalPages, value + 1))
                }
                disabled={page >= totalPages}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
