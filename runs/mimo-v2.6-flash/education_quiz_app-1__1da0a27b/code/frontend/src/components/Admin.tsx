import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../api";
import type { OptionLetter, QuestionPage } from "../types";

const LETTERS: OptionLetter[] = ["A", "B", "C", "D"];
const PAGE_SIZE = 10;

interface FormState {
  text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: OptionLetter;
}

const EMPTY_FORM: FormState = {
  text: "",
  option_a: "",
  option_b: "",
  option_c: "",
  option_d: "",
  correct_option: "A",
};

export default function Admin() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<QuestionPage | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const load = useCallback(async (targetPage: number) => {
    try {
      const result = await api<QuestionPage>(
        `/api/admin/questions?page=${targetPage}&page_size=${PAGE_SIZE}`,
      );
      setData(result);
      setListError(null);
    } catch (err) {
      setListError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [page, load]);

  const setField = (field: keyof FormState, value: string) => {
    setForm((previous) => ({ ...previous, [field]: value }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaved(null);
    try {
      await api("/api/admin/questions", { method: "POST", body: form });
      setSaved("Question added.");
      setForm(EMPTY_FORM);
      setPage(1);
      await load(1);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="space-y-8">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-2xl font-bold text-slate-900">Add question</h1>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="q-text" className="mb-1 block text-sm font-medium text-slate-700">
              Question text
            </label>
            <input
              id="q-text"
              value={form.text}
              onChange={(event) => setField("text", event.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {LETTERS.map((letter) => {
              const field = `option_${letter.toLowerCase()}` as
                | "option_a"
                | "option_b"
                | "option_c"
                | "option_d";
              return (
                <div key={letter}>
                  <label
                    htmlFor={`q-${field}`}
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Option {letter}
                  </label>
                  <input
                    id={`q-${field}`}
                    value={form[field]}
                    onChange={(event) => setField(field, event.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              );
            })}
          </div>

          <div>
            <label htmlFor="q-correct" className="mb-1 block text-sm font-medium text-slate-700">
              Correct option
            </label>
            <select
              id="q-correct"
              value={form.correct_option}
              onChange={(event) => setField("correct_option", event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {LETTERS.map((letter) => (
                <option key={letter} value={letter}>
                  {letter}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </p>
          )}
          {saved && (
            <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              {saved}
            </p>
          )}

          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700"
          >
            Add question
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Questions</h2>
          <span className="text-sm text-slate-500">{total} total</span>
        </div>

        {listError && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {listError}
          </p>
        )}

        {!listError && data && data.items.length === 0 && (
          <p className="text-sm text-slate-500">No questions yet.</p>
        )}

        {data && data.items.length > 0 && (
          <ul className="divide-y divide-slate-200">
            {data.items.map((question) => (
              <li key={question.id} className="py-3">
                <p className="font-medium text-slate-900">{question.text}</p>
                <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                  {LETTERS.map((letter) => {
                    const optionText =
                      question[`option_${letter.toLowerCase() as "a" | "b" | "c" | "d"}`];
                    const isCorrect = letter === question.correct_option;
                    return (
                      <li
                        key={letter}
                        className={isCorrect ? "font-semibold text-green-700" : "text-slate-600"}
                      >
                        {letter}. {optionText}
                        {isCorrect && " ✓"}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => setPage(page - 1)}
            disabled={page <= 1}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-slate-500">
            Page {page} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage(page + 1)}
            disabled={page >= pageCount}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
