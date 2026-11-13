import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError, errorMessage, OPTIONS, optionText } from "./api";
import type { Question } from "./api";
import { Icon } from "./Icons";
import { ErrorBanner, inputClass, Loading, Modal, PageHeading, primaryButton, secondaryButton } from "./ui";

type QuestionPage = { items: Question[]; total: number; page: number; page_size: number };

function AddQuestion({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({ text: "", option_a: "", option_b: "", option_c: "", option_d: "", correct_option: "" });
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setFields({});
    try {
      await api("/admin/questions", { method: "POST", body: JSON.stringify(form) });
      onAdded();
    } catch (error) {
      setError(errorMessage(error));
      if (error instanceof ApiError) setFields(error.fields);
    } finally { setBusy(false); }
  }
  return <Modal onClose={onClose} title="Add a question"><span className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-lime"><Icon name="plus" size={24} /></span><h2 className="text-2xl font-semibold tracking-[-.7px]">Plant a little curiosity.</h2><p className="mt-2 text-xs leading-relaxed text-muted">One question, four possibilities, one correct answer.</p><form onSubmit={submit} noValidate className="mt-6 space-y-4"><ErrorBanner message={error} /><div><label htmlFor="question-text" className="mb-2 block text-xs font-medium">Question</label><textarea id="question-text" autoFocus rows={3} value={form.text} onChange={event => setForm({ ...form, text: event.target.value })} placeholder="What would you like the world to know?" className={`${inputClass} resize-y`} aria-invalid={!!fields.text} aria-describedby={fields.text ? "question-text-error" : undefined} />{fields.text && <p id="question-text-error" className="mt-1.5 text-[11px] text-red-700">{fields.text}</p>}</div>{OPTIONS.map(option => { const field = `option_${option.toLowerCase()}` as "option_a" | "option_b" | "option_c" | "option_d"; return <div key={option}><label htmlFor={field} className="mb-1.5 block text-xs font-medium">Option {option}</label><input id={field} value={form[field]} onChange={event => setForm({ ...form, [field]: event.target.value })} className={inputClass} placeholder={`Answer ${option}`} aria-invalid={!!fields[field]} aria-describedby={fields[field] ? `${field}-error` : undefined} />{fields[field] && <p id={`${field}-error`} className="mt-1.5 text-[11px] text-red-700">{fields[field]}</p>}</div>; })}<div><label htmlFor="correct-option" className="mb-1.5 block text-xs font-medium">Correct option</label><select id="correct-option" value={form.correct_option} onChange={event => setForm({ ...form, correct_option: event.target.value })} className={inputClass} aria-invalid={!!fields.correct_option} aria-describedby={fields.correct_option ? "correct-option-error" : undefined}><option value="">Choose the correct answer</option>{OPTIONS.map(option => <option key={option} value={option}>Option {option}</option>)}</select>{fields.correct_option && <p id="correct-option-error" className="mt-1.5 text-[11px] text-red-700">{fields.correct_option}</p>}</div><button disabled={busy} className={`${primaryButton} mt-2 w-full`}>{busy ? "Adding a little knowledge…" : "Add question"}<Icon name="plus" size={17} /></button></form></Modal>;
}

export default function Admin() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<QuestionPage | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [revision, setRevision] = useState(0);
  const [success, setSuccess] = useState(false);
  useEffect(() => {
    let active = true;
    api<QuestionPage>(`/admin/questions?page=${page}&page_size=10`).then(data => { if (active) setData(data); }).catch(error => { if (active) setError(errorMessage(error)); });
    return () => { active = false; };
  }, [page, revision]);
  function changePage(next: number) { setData(null); setError(""); setPage(next); }
  return <div>
    <PageHeading eyebrow="Behind the discoveries" title="A world of good questions." description="The little facts and big ideas that keep curious minds coming back." action={<button onClick={() => setAdding(true)} className={primaryButton}><Icon name="plus" size={17} />Add question</button>} />
    {success && <p role="status" className="mb-5 flex items-center gap-2 rounded-xl border border-[#d7e5cb] bg-[#edf4e6] p-4 text-xs text-[#6d845b]"><Icon name="check" size={16} />A new discovery is ready. Your question has been added.</p>}
    <ErrorBanner message={error} />{error && <button onClick={() => { setError(""); setRevision(revision + 1); }} className={`${secondaryButton} mt-3`}>Try again</button>}
    {!data && !error ? <Loading label="Opening the question collection…" /> : data && <><div className="mb-5 flex items-center justify-between border-b border-[#e0e5d8] py-4"><h2 className="text-sm font-medium">Question collection <span className="ml-2 rounded-full bg-[#e9efdf] px-2.5 py-1 text-[10px] text-[#7d8d6c]">{data.total}</span></h2><p className="text-[10px] text-muted">Only visible to the admin</p></div><div className="space-y-4">{data.items.map(question => <article key={question.id} className="rounded-2xl border border-[#e0e6d9] bg-white p-5 sm:p-6"><div className="mb-4 flex items-start gap-3"><span className="mt-0.5 text-[10px] text-[#9aa68e]">#{question.id}</span><h3 className="text-sm leading-relaxed font-medium">{question.text}</h3></div><div className="grid gap-2 sm:grid-cols-2">{OPTIONS.map(option => <div key={option} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs ${option === question.correct_option ? "bg-[#edf4e5] text-[#607d4f]" : "bg-[#f7f8f4] text-[#8d9684]"}`}><span className="text-[10px] font-medium">{option}</span><span className="flex-1">{optionText(question, option)}</span>{option === question.correct_option && <Icon name="check" size={14} />}</div>)}</div></article>)}</div><div className="mt-6 flex items-center justify-between"><span className="text-xs text-muted">Page {data.page} of {Math.max(1, Math.ceil(data.total / data.page_size))}</span><div className="flex gap-2"><button onClick={() => changePage(page - 1)} disabled={page === 1} className={secondaryButton}><Icon name="chevron" size={14} className="rotate-180" />Previous</button><button onClick={() => changePage(page + 1)} disabled={page * data.page_size >= data.total} className={secondaryButton}>Next<Icon name="chevron" size={14} /></button></div></div></>}
    {adding && <AddQuestion onClose={() => setAdding(false)} onAdded={() => { setAdding(false); setPage(1); setRevision(revision + 1); setSuccess(true); setError(""); setData(null); }} />}
  </div>;
}
