import { useCallback, useEffect, useState } from "react";
import { ApiError, apiRequest } from "@/api";
import type { Question } from "@/types";

const LETTERS = ["A", "B", "C", "D"] as const;

const OPTION_FIELDS = {
  A: "option_a",
  B: "option_b",
  C: "option_c",
  D: "option_d",
} as const;

interface AdminQuestionsResponse {
  items: Question[];
  total: number;
  page: number;
  page_size: number;
}

export default function AdminPanel() {
  const [text, setText] = useState("");
  const [options, setOptions] = useState({ option_a: "", option_b: "", option_c: "", option_d: "" });
  const [correctOption, setCorrectOption] = useState("A");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [listError, setListError] = useState("");
  const [loadingList, setLoadingList] = useState(true);

  const loadQuestions = useCallback(async () => {
    setLoadingList(true);
    setListError("");
    try {
      const result = await apiRequest<AdminQuestionsResponse>(
        `/api/admin/questions?page=${page}&page_size=${pageSize}`,
      );
      setQuestions(result.items);
      setTotal(result.total);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : "Could not load the questions.");
    } finally {
      setLoadingList(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    void loadQuestions();
  }, [loadQuestions]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    setFieldErrors({});
    setSuccess("");
    try {
      await apiRequest<Question>("/api/admin/questions", {
        method: "POST",
        body: { text, ...options, correct_option: correctOption },
      });
      setText("");
      setOptions({ option_a: "", option_b: "", option_c: "", option_d: "" });
      setCorrectOption("A");
      setSuccess("Question added.");
      await loadQuestions();
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        setFieldErrors(err.errors);
      } else {
        setFormError("Could not add the question.");
      }
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-xl font-bold text-slate-900">Add question</h2>
        <p className="mt-1 text-sm text-slate-500">
          New questions become available in every quiz draw.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="text" className="block text-sm font-medium text-slate-700">
              Question
            </label>
            <input
              id="text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-indigo-500 ${
                fieldErrors.text ? "border-red-400 focus:ring-red-400" : "border-slate-300"
              }`}
            />
            {fieldErrors.text && <p className="mt-1 text-xs text-red-600">{fieldErrors.text}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {LETTERS.map((letter) => {
              const field = OPTION_FIELDS[letter];
              return (
                <div key={letter}>
                  <label htmlFor={field} className="block text-sm font-medium text-slate-700">
                    Option {letter}
                  </label>
                  <input
                    id={field}
                    value={options[field]}
                    onChange={(event) =>
                      setOptions((prev) => ({ ...prev, [field]: event.target.value }))
                    }
                    className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-indigo-500 ${
                      fieldErrors[field] ? "border-red-400 focus:ring-red-400" : "border-slate-300"
                    }`}
                  />
                  {fieldErrors[field] && (
                    <p className="mt-1 text-xs text-red-600">{fieldErrors[field]}</p>
                  )}
                </div>
              );
            })}
          </div>

          <fieldset>
            <legend className="block text-sm font-medium text-slate-700">Correct option</legend>
            <div className="mt-2 flex flex-wrap gap-4">
              {LETTERS.map((letter) => (
                <label key={letter} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="correct_option"
                    value={letter}
                    checked={correctOption === letter}
                    onChange={() => setCorrectOption(letter)}
                    className="h-4 w-4 accent-indigo-600"
                  />
                  {letter}
                </label>
              ))}
            </div>
            {fieldErrors.correct_option && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.correct_option}</p>
            )}
          </fieldset>

          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          )}
          {success && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Add question"}
          </button>
        </form>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-slate-900">
            Questions <span className="text-sm font-medium text-slate-500">({total})</span>
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-sm text-slate-500">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((prev) => prev + 1)}
              disabled={page >= totalPages}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>

        {listError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {listError}
          </div>
        )}

        {loadingList ? (
          <p className="text-sm text-slate-500">Loading questions...</p>
        ) : (
          <ul className="space-y-2">
            {questions.map((question) => (
              <li
                key={question.id}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3"
              >
                <p className="font-medium text-slate-900">{question.text}</p>
                <ul className="mt-2 grid gap-1 text-sm text-slate-600 sm:grid-cols-2">
                  {LETTERS.map((letter) => (
                    <li
                      key={letter}
                      className={
                        question.correct_option === letter
                          ? "font-semibold text-emerald-700"
                          : undefined
                      }
                    >
                      {letter}. {question[OPTION_FIELDS[letter]]}
                      {question.correct_option === letter && " ✓"}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
