import { useEffect, useRef, useState } from "react";
import { api, errorMessage, OPTIONS, optionText } from "./api";
import type { Attempt, Option, Question } from "./api";
import { Icon } from "./Icons";
import { ErrorBanner, primaryButton, secondaryButton } from "./ui";

export default function Quiz({ questions, onComplete, onExit }: { questions: Question[]; onComplete: (attempt: Attempt) => void; onExit: () => void }) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<Record<number, Option>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const question = questions[index];
  const last = index === questions.length - 1;
  useEffect(() => { heading.current?.focus(); }, [index]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);
  async function advance() {
    if (!selected[question.id] || submitting) return;
    if (!last) { setIndex(index + 1); return; }
    setSubmitting(true); setError("");
    try {
      const attempt = await api<Attempt>("/attempts", { method: "POST", body: JSON.stringify({ answers: questions.map(item => ({ question_id: item.id, selected: selected[item.id] })) }) });
      onComplete(attempt);
    } catch (error) { setError(errorMessage(error)); }
    finally { setSubmitting(false); }
  }
  return <div className="mx-auto max-w-[780px]">
    <div className="mb-8 flex items-center justify-between"><span className="flex items-center gap-2 text-[11px] text-muted"><Icon name="globe" size={16} />THE EVERYDAY QUIZ</span><button disabled={submitting} onClick={onExit} className="flex items-center gap-2 rounded-lg p-2 text-xs text-muted hover:text-ink">Leave quiz<Icon name="close" size={16} /></button></div>
    <div className="mb-3 flex items-center justify-between text-xs"><p className="font-medium">Question {index + 1} <span className="font-normal text-muted">of {questions.length}</span></p><span className="text-[#87977b]">{Math.round(index / questions.length * 100)}% of the adventure</span></div>
    <div className="mb-8 h-1.5 overflow-hidden rounded-full bg-[#e4e8dd]"><div className="h-full rounded-full bg-[#91a77a] transition-all duration-500" style={{ width: `${(index + 1) / questions.length * 100}%` }} /></div>
    <section className="rounded-3xl border border-[#e0e6d9] bg-white p-6 sm:p-10">
      <span className="mb-5 inline-flex rounded-lg bg-[#f0f4e8] px-3 py-1.5 text-[10px] font-medium tracking-wide text-[#7a8a68]">A LITTLE SOMETHING TO THINK ABOUT</span>
      <h1 ref={heading} tabIndex={-1} className="mb-8 text-[25px] leading-[1.4] font-medium tracking-[-.7px] outline-none sm:text-[30px]">{question.text}</h1>
      <form onSubmit={event => { event.preventDefault(); void advance(); }}>
        <fieldset disabled={submitting}><legend className="sr-only">Choose one answer</legend><div className="space-y-3">{OPTIONS.map(option => <label key={`${question.id}-${option}`} className={`relative flex cursor-pointer items-center gap-4 rounded-xl border p-4 transition-colors sm:p-5 ${selected[question.id] === option ? "border-[#8ba476] bg-[#f0f5e9]" : "border-[#e4e8df] hover:bg-paper"}`}><input type="radio" name={`question-${question.id}`} value={option} checked={selected[question.id] === option} onChange={() => setSelected(previous => ({ ...previous, [question.id]: option }))} className="peer sr-only" /><span className="pointer-events-none absolute inset-0 rounded-xl peer-focus-visible:ring-2 peer-focus-visible:ring-[#73966b]" /><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-medium ${selected[question.id] === option ? "bg-[#dae7c9]" : "bg-[#f3f5ef] text-muted"}`}>{option}</span><span className="flex-1 text-sm">{optionText(question, option)}</span><span className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border ${selected[question.id] === option ? "border-[#7e976a] bg-[#7e976a] text-white" : "border-[#cdd4c5]"}`}>{selected[question.id] === option && <Icon name="check" size={12} />}</span></label>)}</div></fieldset>
        <div className="mt-5"><ErrorBanner message={error} /></div>
        <div className="mt-7 flex items-center justify-between gap-3">{index > 0 ? <button type="button" disabled={submitting} onClick={() => setIndex(index - 1)} className={secondaryButton}><Icon name="arrow" size={15} className="rotate-180" />Back</button> : <span className="hidden text-[11px] text-muted sm:block">Trust your curiosity.</span>}<button type="submit" disabled={!selected[question.id] || submitting} className={`${primaryButton} ml-auto min-w-40`}>{submitting ? "A moment of truth…" : last ? "Submit answers" : "Next question"}<Icon name={last ? "check" : "arrow"} size={17} /></button></div>
      </form>
    </section>
    <p className="mt-6 flex items-center justify-center gap-2 text-[11px] text-muted"><Icon name="leaf" size={14} />No timer, no rush. Good things take a little thought.</p>
  </div>;
}
