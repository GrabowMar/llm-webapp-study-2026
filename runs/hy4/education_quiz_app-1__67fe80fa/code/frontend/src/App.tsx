import { useEffect, useState } from "react";
import {
  api,
  errorMessage,
  getToken,
  optionLabels,
  optionText,
  setToken,
} from "./api";
import type {
  ApiError,
  Attempt,
  Me,
  Option,
  Question,
  QuizQuestion,
  ReviewAnswer,
} from "./api";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";
const labelClass = "mb-1 block text-sm font-medium text-slate-700";
const primaryBtn =
  "inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryBtn =
  "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
const card = "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm";
const QUIZ_SIZE = 5;
const PAGE_SIZE = 10;

type View = "quiz" | "result" | "history" | "review" | "admin";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function validationMessages(err: unknown): string[] {
  if (typeof err === "object" && err !== null && "errors" in err) {
    const errors = (err as ApiError).errors;
    if (errors) return Object.values(errors);
  }
  return [errorMessage(err)];
}

function Alert({ children, tone = "error" }: { children: React.ReactNode; tone?: "error" | "info" }) {
  return (
    <div
      className={
        tone === "error"
          ? "rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          : "rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-700"
      }
    >
      {children}
    </div>
  );
}

function Spinner() {
  return <p className="py-10 text-center text-sm text-slate-500">Loading…</p>;
}

function AuthPanel({ onSignedIn }: { onSignedIn: (me: Me) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result =
        mode === "login"
          ? await api.login(username, password)
          : await api.register(username, password);
      setToken(result.token);
      const me = await api.me();
      setUsername("");
      setPassword("");
      onSignedIn(me);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={card}>
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setMode("login");
            setError(null);
          }}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
            mode === "login" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("register");
            setError(null);
          }}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
            mode === "register" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Register
        </button>
      </div>
      <h2 className="mb-1 text-lg font-bold text-slate-900">
        {mode === "login" ? "Welcome back" : "Create an account"}
      </h2>
      <p className="mb-4 text-sm text-slate-500">
        {mode === "login"
          ? "Sign in to keep a history of your quiz attempts."
          : "Register to save your results and track your progress."}
      </p>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className={labelClass} htmlFor="auth-username">
            Username
          </label>
          <input
            id="auth-username"
            className={inputClass}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="auth-password">
            Password
          </label>
          <input
            id="auth-password"
            type="password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
          />
        </div>
        {error && <Alert>{error}</Alert>}
        <button type="submit" className={primaryBtn} disabled={busy}>
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
    </div>
  );
}

function ReviewList({ answers }: { answers: ReviewAnswer[] }) {
  return (
    <ol className="space-y-4">
      {answers.map((answer, index) => (
        <li
          key={`${answer.question_id}-${index}`}
          className="rounded-xl border border-slate-200 bg-white p-4"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <p className="font-semibold text-slate-900">
              <span className="mr-2 text-slate-400">{index + 1}.</span>
              {answer.text}
            </p>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                answer.is_correct
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {answer.is_correct ? "Correct" : "Incorrect"}
            </span>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {optionLabels.map((option) => {
              const isCorrect = option === answer.correct_option;
              const isChosen = option === answer.selected;
              const classes = isCorrect
                ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                : isChosen
                  ? "border-red-400 bg-red-50 text-red-700"
                  : "border-slate-200 bg-slate-50 text-slate-600";
              return (
                <li
                  key={option}
                  className={`rounded-lg border px-3 py-2 text-sm ${classes}`}
                >
                  <span className="mr-2 font-bold">{option}.</span>
                  {optionText(answer, option)}
                  {isCorrect && <span className="ml-2 text-xs font-semibold">✓ Correct</span>}
                  {isChosen && !isCorrect && (
                    <span className="ml-2 text-xs font-semibold">Your choice</span>
                  )}
                  {isChosen && isCorrect && (
                    <span className="ml-2 text-xs font-semibold">Your choice</span>
                  )}
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ol>
  );
}

function ResultView({
  attempt,
  me,
  onNewQuiz,
  onSignIn,
}: {
  attempt: Attempt;
  me: Me | null;
  onNewQuiz: () => void;
  onSignIn: () => void;
}) {
  const percent = attempt.total_questions
    ? Math.round((attempt.correct / attempt.total_questions) * 100)
    : 0;
  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 p-8 text-center text-white shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-widest text-indigo-100">
          Your result
        </p>
        <p className="mt-2 text-6xl font-extrabold">{attempt.score}</p>
        <p className="mt-1 text-indigo-100">
          {attempt.correct} of {attempt.total_questions} correct ({percent}%)
        </p>
        <div className="mx-auto mt-5 h-2 w-full max-w-sm overflow-hidden rounded-full bg-white/25">
          <div className="h-full rounded-full bg-white" style={{ width: `${percent}%` }} />
        </div>
      </div>

      {!me && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-4">
          <p className="text-sm font-medium text-indigo-800">
            Sign in to save your results.
          </p>
          <button className={primaryBtn} onClick={onSignIn} type="button">
            Sign in
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">Review your answers</h2>
        <button className={secondaryBtn} onClick={onNewQuiz} type="button">
          Try another quiz
        </button>
      </div>
      <ReviewList answers={attempt.answers} />
    </div>
  );
}

function QuizView({
  questions,
  answers,
  index,
  onSelect,
  onNext,
  onSubmit,
  busy,
  error,
}: {
  questions: QuizQuestion[];
  answers: Record<number, Option | null>;
  index: number;
  onSelect: (option: Option) => void;
  onNext: () => void;
  onSubmit: () => void;
  busy: boolean;
  error: string | null;
}) {
  const question = questions[index];
  const total = questions.length;
  const selected = answers[question.id] ?? null;
  const isLast = index === total - 1;
  return (
    <div className={card}>
      <div className="mb-2 flex items-center justify-between text-sm font-medium text-slate-500">
        <span>
          Question {index + 1} of {total}
        </span>
        <span>{Math.round(((index + 1) / total) * 100)}%</span>
      </div>
      <div className="mb-6 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-indigo-600 transition-all"
          style={{ width: `${((index + 1) / total) * 100}%` }}
        />
      </div>

      <h2 className="mb-5 text-xl font-bold text-slate-900">{question.text}</h2>
      <fieldset className="space-y-3">
        <legend className="sr-only">Choose one answer</legend>
        {optionLabels.map((option) => {
          const chosen = selected === option;
          return (
            <label
              key={option}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                chosen
                  ? "border-indigo-500 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-200"
                  : "border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name={`question-${question.id}`}
                value={option}
                checked={chosen}
                onChange={() => onSelect(option)}
                className="h-4 w-4 accent-indigo-600"
              />
              <span className="font-bold">{option}.</span>
              <span>{optionText(question, option)}</span>
            </label>
          );
        })}
      </fieldset>

      {error && (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between">
        <span className="text-xs text-slate-400">Select an answer to continue</span>
        {isLast ? (
          <button
            type="button"
            className={primaryBtn}
            disabled={selected === null || busy}
            onClick={onSubmit}
          >
            {busy ? "Submitting…" : "Submit"}
          </button>
        ) : (
          <button
            type="button"
            className={primaryBtn}
            disabled={selected === null}
            onClick={onNext}
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}

function HistoryView({ onOpen }: { onOpen: (id: number) => void }) {
  const [attempts, setAttempts] = useState<Attempt[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .attempts()
      .then((data) => active && setAttempts(data.items))
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!attempts) return <Spinner />;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-slate-900">Your saved attempts</h2>
      {attempts.length === 0 ? (
        <div className={card}>
          <p className="text-sm text-slate-500">
            You have no saved attempts yet. Take a quiz and your results will appear here.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {attempts.map((attempt) => (
            <li key={attempt.id}>
              <button
                type="button"
                onClick={() => onOpen(attempt.id)}
                className="flex w-full items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {formatDate(attempt.submitted_at)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {attempt.total_questions} questions
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-extrabold text-indigo-600">{attempt.score}</p>
                  <p className="text-xs text-slate-500">
                    {attempt.correct} of {attempt.total_questions} correct
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AdminView() {
  const [form, setForm] = useState({
    text: "",
    option_a: "",
    option_b: "",
    option_c: "",
    option_d: "",
    correct_option: "A" as Option,
  });
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{
    items: Question[];
    total: number;
    page: number;
    page_size: number;
  } | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  function loadQuestions(targetPage: number) {
    setListError(null);
    api
      .questions(targetPage, PAGE_SIZE)
      .then(setData)
      .catch((err) => setListError(errorMessage(err)));
  }

  useEffect(() => {
    loadQuestions(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors([]);
    setSuccess(null);
    try {
      await api.addQuestion(form);
      setSuccess("Question added.");
      setForm({
        text: "",
        option_a: "",
        option_b: "",
        option_c: "",
        option_d: "",
        correct_option: "A",
      });
      setPage(1);
      loadQuestions(1);
    } catch (err) {
      setErrors(validationMessages(err));
    } finally {
      setBusy(false);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className={card}>
        <h2 className="mb-4 text-lg font-bold text-slate-900">Add question</h2>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className={labelClass} htmlFor="q-text">
              Question text
            </label>
            <textarea
              id="q-text"
              className={inputClass}
              rows={2}
              value={form.text}
              onChange={(e) => update("text", e.target.value)}
              required
            />
          </div>
          {(["option_a", "option_b", "option_c", "option_d"] as const).map((field, i) => (
            <div key={field}>
              <label className={labelClass} htmlFor={`q-${field}`}>
                Option {optionLabels[i]}
              </label>
              <input
                id={`q-${field}`}
                className={inputClass}
                value={form[field]}
                onChange={(e) => update(field, e.target.value)}
                required
              />
            </div>
          ))}
          <div>
            <label className={labelClass} htmlFor="q-correct">
              Correct option
            </label>
            <select
              id="q-correct"
              className={inputClass}
              value={form.correct_option}
              onChange={(e) => setForm({ ...form, correct_option: e.target.value as Option })}
            >
              {optionLabels.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          {errors.length > 0 && (
            <Alert>
              <ul className="list-inside list-disc space-y-1">
                {errors.map((message, i) => (
                  <li key={i}>{message}</li>
                ))}
              </ul>
            </Alert>
          )}
          {success && <Alert tone="info">{success}</Alert>}

          <button type="submit" className={primaryBtn} disabled={busy}>
            {busy ? "Adding…" : "Add question"}
          </button>
        </form>
      </div>

      <div className={card}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Questions</h2>
          {data && (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {data.total} total
            </span>
          )}
        </div>
        {listError && <Alert>{listError}</Alert>}
        {!data && !listError && <Spinner />}
        {data && (
          <>
            <ul className="space-y-2">
              {data.items.map((question) => (
                <li key={question.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-slate-800">
                      <span className="mr-1 text-slate-400">#{question.id}</span>
                      {question.text}
                    </p>
                    <span className="shrink-0 rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                      {question.correct_option}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {optionLabels.map((o) => `${o}: ${optionText(question, o)}`).join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between text-sm">
              <button
                type="button"
                className={secondaryBtn}
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span className="text-slate-500">
                Page {data.page} of {totalPages}
              </span>
              <button
                type="button"
                className={secondaryBtn}
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [view, setView] = useState<View>("quiz");
  const [showAuth, setShowAuth] = useState(false);

  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, Option | null>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<Attempt | null>(null);
  const [review, setReview] = useState<Attempt | null>(null);

  useEffect(() => {
    if (!getToken()) {
      setAuthReady(true);
      return;
    }
    api
      .me()
      .then(setMe)
      .catch(() => setToken(null))
      .finally(() => setAuthReady(true));
  }, []);

  function startQuiz() {
    setView("quiz");
    setQuestions(null);
    setQuizError(null);
    setResult(null);
    setReview(null);
    setIndex(0);
    setAnswers({});
    setSubmitError(null);
    api
      .quiz(QUIZ_SIZE)
      .then((data) => setQuestions(data.items))
      .catch((err) => setQuizError(errorMessage(err)));
  }

  useEffect(() => {
    startQuiz();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function signOut() {
    setToken(null);
    setMe(null);
    if (view === "history" || view === "review" || view === "admin") startQuiz();
  }

  function onSignedIn(user: Me) {
    setMe(user);
    setShowAuth(false);
    startQuiz();
  }

  function select(option: Option) {
    if (!questions) return;
    setAnswers((prev) => ({ ...prev, [questions[index].id]: option }));
  }

  async function submitQuiz() {
    if (!questions) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const attempt = await api.submit(
        questions.map((q) => ({ question_id: q.id, selected: answers[q.id] ?? null })),
      );
      setResult(attempt);
      setView("result");
    } catch (err) {
      setSubmitError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function openAttempt(attemptId: number) {
    try {
      const attempt = await api.attempt(attemptId);
      setReview(attempt);
      setView("review");
    } catch (err) {
      setQuizError(errorMessage(err));
      startQuiz();
    }
  }

  const tabs: { key: View; label: string; show: boolean }[] = [
    { key: "quiz", label: "Quiz", show: true },
    { key: "result", label: "Result", show: view === "result" },
    { key: "history", label: "History", show: !!me },
    { key: "review", label: "Review", show: view === "review" },
    { key: "admin", label: "Admin", show: !!me?.is_admin },
  ];

  function goTo(next: View) {
    if (next === "quiz") startQuiz();
    else setView(next);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-lg font-extrabold text-white">
              Q
            </span>
            <span className="text-lg font-extrabold tracking-tight">Quiz App</span>
          </div>
          <div className="flex items-center gap-3">
            {authReady && me && (
              <>
                <span className="text-sm font-medium text-slate-600">
                  Signed in as <span className="font-bold text-slate-900">{me.username}</span>
                  {me.is_admin && (
                    <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                      admin
                    </span>
                  )}
                </span>
                <button type="button" className={secondaryBtn} onClick={signOut}>
                  Sign out
                </button>
              </>
            )}
            {authReady && !me && (
              <button type="button" className={primaryBtn} onClick={() => setShowAuth((v) => !v)}>
                {showAuth ? "Close" : "Sign in / Register"}
              </button>
            )}
          </div>
        </div>
      </header>

      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4">
          {tabs
            .filter((tab) => tab.show)
            .map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => goTo(tab.key)}
                className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${
                  view === tab.key
                    ? "border-indigo-600 text-indigo-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {tab.label}
              </button>
            ))}
        </div>
      </nav>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        {showAuth && !me && (
          <div className="mx-auto max-w-md">
            <AuthPanel onSignedIn={onSignedIn} />
          </div>
        )}

        {view === "quiz" && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight">Quick quiz</h1>
                <p className="text-sm text-slate-500">
                  {QUIZ_SIZE} random general-knowledge questions. Good luck!
                </p>
              </div>
              <button type="button" className={secondaryBtn} onClick={startQuiz}>
                New quiz
              </button>
            </div>
            {quizError && <Alert>{quizError}</Alert>}
            {!questions && !quizError && <Spinner />}
            {questions && questions.length === 0 && (
              <Alert>No questions are available yet. Please check back later.</Alert>
            )}
            {questions && questions.length > 0 && (
              <QuizView
                questions={questions}
                answers={answers}
                index={index}
                onSelect={select}
                onNext={() => setIndex((i) => i + 1)}
                onSubmit={submitQuiz}
                busy={submitting}
                error={submitError}
              />
            )}
          </>
        )}

        {view === "result" && result && (
          <ResultView
            attempt={result}
            me={me}
            onNewQuiz={startQuiz}
            onSignIn={() => setShowAuth(true)}
          />
        )}

        {view === "history" && me && <HistoryView onOpen={openAttempt} />}

        {view === "review" && review && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight">Attempt review</h1>
                <p className="text-sm text-slate-500">{formatDate(review.submitted_at)}</p>
              </div>
              <button type="button" className={secondaryBtn} onClick={() => goTo("history")}>
                Back to history
              </button>
            </div>
            <div className="rounded-xl bg-indigo-50 px-5 py-4 text-sm font-semibold text-indigo-800">
              Score {review.score} — {review.correct} of {review.total_questions} correct
            </div>
            <ReviewList answers={review.answers} />
          </div>
        )}

        {view === "admin" && me?.is_admin && <AdminView />}
      </main>

      <footer className="mx-auto max-w-5xl px-4 py-8 text-center text-xs text-slate-400">
        Powered by Flask, React &amp; Tailwind CSS
      </footer>
    </div>
  );
}
