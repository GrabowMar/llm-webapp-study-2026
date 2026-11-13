import { useCallback, useEffect, useState } from "react";
import { ApiError, createQuestion, fetchQuestions } from "../api";
import type { NewQuestion, OptionKey, Question } from "../types";

const OPTION_KEYS: OptionKey[] = ["A", "B", "C", "D"];
const PAGE_SIZE = 10;

function optionText(question: Question, key: OptionKey): string {
  switch (key) {
    case "A":
      return question.option_a;
    case "B":
      return question.option_b;
    case "C":
      return question.option_c;
    case "D":
      return question.option_d;
  }
}

const EMPTY_FORM: NewQuestion = {
  text: "",
  option_a: "",
  option_b: "",
  option_c: "",
  option_d: "",
  correct_option: "A",
};

export default function Admin() {
  const [form, setForm] = useState<NewQuestion>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [page, setPage] = useState(1);
  const [pageData, setPageData] = useState<{
    items: Question[];
    total: number;
    page: number;
    page_size: number;
  } | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const loadPage = useCallback((targetPage: number) => {
    setListError(null);
    fetchQuestions(targetPage, PAGE_SIZE)
      .then((data) => {
        setPageData(data);
        setPage(data.page);
      })
      .catch((err) => {
        setListError(err instanceof ApiError ? err.message : "Could not load questions.");
      });
  }, []);

  useEffect(() => {
    loadPage(page);
  }, [page, loadPage]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await createQuestion(form);
      setNotice("Question added.");
      setForm(EMPTY_FORM);
      loadPage(1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const setField = (field: keyof NewQuestion, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const totalPages = pageData ? Math.max(1, Math.ceil(pageData.total / pageData.page_size)) : 1;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Add question</h1>
        <p className="mt-1 text-slate-600">
          New questions take part in quiz draws as soon as they are added.
        </p>

        <form
          onSubmit={submit}
          className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          {notice ? (
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              {notice}
            </div>
          ) : null}

          <div>
            <label htmlFor="q-text" className="block text-sm font-medium text-slate-700">
              Question text
            </label>
            <textarea
              id="q-text"
              rows={2}
              value={form.text}
              onChange={(e) => setField("text", e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              required
            />
          </div>

          {OPTION_KEYS.map((key) => (
            <div key={key}>
              <label htmlFor={`q-option-${key}`} className="block text-sm font-medium text-slate-700">
                Option {key}
              </label>
              <input
                id={`q-option-${key}`}
                type="text"
                value={form[`option_${key.toLowerCase()}` as "option_a"]}
                onChange={(e) => setField(`option_${key.toLowerCase()}` as "option_a", e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                required
              />
            </div>
          ))}

          <div>
            <label htmlFor="q-correct" className="block text-sm font-medium text-slate-700">
              Correct option
            </label>
            <select
              id="q-correct"
              value={form.correct_option}
              onChange={(e) => setField("correct_option", e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              {OPTION_KEYS.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add question"}
          </button>
        </form>
      </div>

      <div>
        <h2 className="text-xl font-semibold text-slate-900">Question list</h2>
        {listError ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {listError}
          </div>
        ) : null}

        {!pageData && !listError ? <p className="mt-4 text-slate-600">Loading…</p> : null}

        {pageData ? (
          <>
            <p className="mt-1 text-sm text-slate-600">
              {pageData.total} question{pageData.total === 1 ? "" : "s"} in total
            </p>
            <ul className="mt-4 space-y-3">
              {pageData.items.map((question) => (
                <li key={question.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="font-medium text-slate-900">
                    <span className="mr-2 text-sm font-normal text-slate-500">#{question.id}</span>
                    {question.text}
                  </p>
                  <ul className="mt-3 space-y-1">
                    {OPTION_KEYS.map((key) => {
                      const isCorrect = key === question.correct_option;
                      return (
                        <li
                          key={key}
                          className={`flex items-center gap-2 rounded-md px-2 py-1 text-sm ${
                            isCorrect
                              ? "bg-green-50 font-medium text-green-800"
                              : "text-slate-700"
                          }`}
                        >
                          <span className="font-semibold">{key})</span>
                          <span className="flex-1">{optionText(question, key)}</span>
                          {isCorrect ? (
                            <span className="rounded-full bg-green-600 px-2 py-0.5 text-xs font-medium text-white">
                              Correct
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg bg-white px-4 py-2 font-medium text-slate-700 shadow-sm ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50"
              >
                Previous
              </button>
              <p className="text-sm text-slate-600">
                Page {pageData.page} of {totalPages}
              </p>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
                className="rounded-lg bg-white px-4 py-2 font-medium text-slate-700 shadow-sm ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
