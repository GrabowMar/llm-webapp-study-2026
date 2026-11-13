import { useEffect, useState } from "react";
import { api, errorMessage } from "./api";
import type { Attempt, User } from "./api";
import { Icon } from "./Icons";
import { ErrorBanner, Loading, PageHeading, primaryButton, secondaryButton } from "./ui";

export default function History({ user, onSignIn, onOpen, onPlay }: { user: User | null; onSignIn: () => void; onOpen: (attempt: Attempt) => void; onPlay: () => void }) {
  const [items, setItems] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(!!user);
  const [opening, setOpening] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!user) return;
    let active = true;
    api<{ items: Attempt[] }>("/attempts").then(data => { if (active) setItems(data.items); }).catch(error => { if (active) setError(errorMessage(error)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user, retry]);
  async function open(id: number) {
    setOpening(id); setError("");
    try { onOpen(await api<Attempt>(`/attempts/${id}`)); }
    catch (error) { setError(errorMessage(error)); }
    finally { setOpening(null); }
  }
  const best = items.length ? Math.max(...items.map(item => item.score)) : 0;
  const average = items.length ? Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length) : 0;
  return <div>
    <PageHeading eyebrow="Your curiosity, collected" title="Every little discovery counts." description="A history of your adventures, aha moments, and progress." action={<button onClick={onPlay} className={primaryButton}>Take a quiz<Icon name="plus" size={16} /></button>} />
    <ErrorBanner message={error} />{error && <button onClick={() => { setError(""); setLoading(true); setRetry(retry + 1); }} className={`${secondaryButton} mt-3`}>Try again</button>}
    {!user ? <div className="rounded-3xl border border-[#e0e6d7] bg-white py-16 text-center"><span className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-mint"><Icon name="history" size={28} /></span><h2 className="text-2xl font-medium tracking-[-.6px]">A story worth keeping.</h2><p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-muted">Sign in to save your quiz attempts and see your curiosity grow over time.</p><button onClick={onSignIn} className={`${primaryButton} mt-7`}>Sign in to see your attempts<Icon name="arrow" size={16} /></button></div> : loading ? <Loading label="Gathering your little victories…" /> : <>
      <div className="my-7 grid grid-cols-3 gap-3 sm:gap-5">{[{ title: "Quizzes explored", value: items.length, icon: "book" as const }, { title: "Personal best", value: `${best}%`, icon: "trophy" as const }, { title: "Average score", value: `${average}%`, icon: "spark" as const }].map(stat => <div key={stat.title} className="rounded-2xl border border-[#e2e7dc] bg-white p-4 sm:p-6"><Icon name={stat.icon} size={20} className="mb-5 text-[#8a9c78]" /><p className="text-2xl font-semibold tracking-[-1px] sm:text-3xl">{stat.value}</p><p className="mt-2 text-[10px] text-muted sm:text-xs">{stat.title}</p></div>)}</div>
      {!items.length ? <div className="rounded-2xl border border-dashed border-[#cfd9c5] py-14 text-center"><Icon name="leaf" size={30} className="mx-auto mb-4 text-[#91a77a]" /><h2 className="text-xl font-medium">Your story starts with a question.</h2><p className="mt-2 text-xs text-muted">Take your first quiz and we’ll keep it right here.</p><button onClick={onPlay} className={`${primaryButton} mt-6`}>Let’s discover something<Icon name="arrow" size={16} /></button></div> : <section className="overflow-hidden rounded-2xl border border-[#e0e6d8] bg-white"><div className="grid grid-cols-[1fr_70px_36px] gap-3 border-b border-[#e7eadf] bg-[#f5f7ef] px-5 py-4 text-[10px] tracking-wider text-muted uppercase sm:grid-cols-[1fr_120px_100px_75px] sm:px-7"><span>Your adventures</span><span className="hidden sm:block">Questions</span><span>Score</span><span className="text-right">Review</span></div>{items.map(attempt => <button key={attempt.id} disabled={opening !== null} onClick={() => void open(attempt.id!)} className="grid w-full grid-cols-[1fr_70px_36px] items-center gap-3 border-b border-[#edf0e7] px-5 py-5 text-left last:border-b-0 hover:bg-[#f8faf4] sm:grid-cols-[1fr_120px_100px_75px] sm:px-7"><div><span className="text-xs font-medium">{new Date(attempt.submitted_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span><p className="mt-1.5 text-[10px] text-muted">{new Date(attempt.submitted_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}<span className="sm:hidden"> · {attempt.total_questions} questions</span></p></div><span className="hidden text-xs text-muted sm:block">{attempt.correct} / {attempt.total_questions} correct</span><span className="w-fit rounded-full bg-[#edf3e5] px-3 py-1.5 text-[11px] font-medium text-[#72865f]">{attempt.score}%</span><span className="flex items-center justify-end text-muted">{opening === attempt.id ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-mint border-t-ink" /> : <Icon name="arrow" size={17} />}</span></button>)}</section>}
    </>}
  </div>;
}
