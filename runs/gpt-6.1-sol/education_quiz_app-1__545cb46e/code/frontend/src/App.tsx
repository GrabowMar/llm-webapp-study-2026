import { useEffect, useState } from "react";
import { api, errorMessage, getToken, setToken } from "./api";
import type { Attempt, Question, User } from "./api";
import { Icon } from "./Icons";
import type { IconName } from "./Icons";
import Home from "./Home";
import Auth from "./Auth";
import Quiz from "./Quiz";
import Results from "./Results";
import History from "./History";
import Admin from "./Admin";
import { ErrorBanner, Modal, primaryButton } from "./ui";

type Screen = "home" | "quiz" | "result" | "history" | "admin";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(!!getToken());
  const [screen, setScreen] = useState<Screen>("home");
  const [auth, setAuth] = useState<"login" | "register" | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [help, setHelp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [result, setResult] = useState<Attempt | null>(null);
  const [historical, setHistorical] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    if (getToken()) api<User>("/auth/me").then(user => { if (active) setUser(user); }).catch(() => { if (active) setToken(null); }).finally(() => { if (active) setChecking(false); });
    const expire = () => { setUser(null); setNotice("Your session has expired. Sign in again to save your next discoveries."); };
    window.addEventListener("quizly:session-expired", expire);
    return () => { active = false; window.removeEventListener("quizly:session-expired", expire); };
  }, []);

  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [screen]);

  function navigate(next: Screen) {
    if (screen === "quiz" && next !== "quiz" && !window.confirm("Leave this quiz? Your unfinished answers won’t be saved.")) return;
    setScreen(next); setMobileNav(false); setError(""); setNotice("");
  }

  async function startQuiz(count: number) {
    setLoading(true); setError(""); setNotice("");
    try {
      const data = await api<{ items: Question[] }>(`/quiz?count=${count}`);
      if (!data.items.length) throw new Error("No questions are available just yet. Please try again soon.");
      setQuestions(data.items); setResult(null); setHistorical(false); setScreen("quiz");
    } catch (error) { setError(errorMessage(error)); }
    finally { setLoading(false); }
  }

  async function signedIn(account: User) {
    setUser(account); setAuth(null); setNotice("");
    if (screen === "result" && result && result.id === null) {
      try {
        const saved = await api<Attempt>("/attempts", { method: "POST", body: JSON.stringify({ answers: result.answers.map(answer => ({ question_id: answer.question_id, selected: answer.selected })) }) });
        setResult(saved);
      } catch (error) { setNotice(`You’re signed in, but this result couldn’t be saved: ${errorMessage(error)}`); }
    }
  }

  async function signOut() {
    try { await api("/auth/logout", { method: "POST" }); }
    catch (error) { setNotice(errorMessage(error)); return; }
    setToken(null); setUser(null); setScreen("home"); setResult(null); setNotice(""); setMobileNav(false);
  }

  const nav: { screen: Screen; title: string; icon: IconName }[] = [
    { screen: "home", title: "Let’s play", icon: "grid" },
    { screen: "history", title: "My attempts", icon: "history" },
    ...(user?.is_admin ? [{ screen: "admin" as const, title: "Questions", icon: "book" as const }] : []),
  ];
  const pageName = screen === "history" ? "My attempts" : screen === "admin" ? "Question studio" : screen === "result" ? "Your results" : screen === "quiz" ? "The everyday quiz" : "Let’s play";

  return <div className="min-h-screen">
    {mobileNav && <button aria-label="Close navigation" onClick={() => setMobileNav(false)} className="fixed inset-0 z-30 bg-ink/25 backdrop-blur-sm md:hidden" />}
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[224px] flex-col border-r border-[#e4e8df] bg-[#fcfdf9] px-5 py-8 transition-transform duration-200 md:translate-x-0 xl:w-[238px] ${mobileNav ? "translate-x-0" : "-translate-x-full"}`}>
      <button onClick={() => navigate("home")} className="mb-12 ml-3 flex w-fit items-center gap-2.5" aria-label="Quizly home"><span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-lime"><Icon name="spark" size={25} /></span><span className="text-[29px] font-semibold tracking-[-1.8px]">quizly<span className="text-[#92ab72]">.</span></span></button>
      <p className="mb-4 pl-4 text-[9px] font-medium tracking-[.17em] text-[#a1a999]">A LITTLE EXPLORATION</p>
      <nav aria-label="Main navigation" className="space-y-2">{nav.map(item => { const active = item.screen === "home" ? ["home", "quiz", "result"].includes(screen) : screen === item.screen; return <button key={item.screen} onClick={() => navigate(item.screen)} aria-current={active ? "page" : undefined} className={`flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-[12px] ${active ? "bg-[#eaf0df] font-medium text-[#536847]" : "text-[#8e9687] hover:bg-[#f1f4ea] hover:text-ink"}`}><Icon name={item.icon} size={18} />{item.title}{active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#7d9767]" />}</button>; })}</nav>
      <div className="mt-auto pt-12"><div className="relative mb-7 rounded-2xl border border-[#e3e7d9] bg-[#f4f6ee] px-4 py-5"><span className="mb-3 flex h-8 w-8 items-center justify-center rounded-full border border-[#dfe6d1] bg-[#fcfdf7] text-[#8a9b72]"><Icon name="leaf" size={17} /></span><p className="text-[12px] font-medium tracking-[-.2px]">Keep that spark alive.</p><p className="mt-2 text-[10px] leading-[1.85] text-[#949c89]">You don’t have to know it all.<br />Just be curious enough to ask.</p><button onClick={() => setHelp(true)} className="mt-4 flex items-center gap-2 text-[10px] font-medium text-[#7e906b] hover:text-ink">How it works<Icon name="arrow" size={13} /></button></div>
        <div className="border-t border-[#e6e9df] pt-5">{user ? <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e8eddf] text-xs font-medium uppercase">{user.username.slice(0, 2)}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{user.username}</p><p className="mt-1 text-[9px] text-muted">{user.is_admin ? "The question keeper" : "A curious mind"}</p></div><button onClick={() => void signOut()} aria-label="Sign out" title="Sign out" className="rounded-lg p-2 text-muted hover:bg-mint hover:text-ink"><Icon name="logout" size={16} /></button></div> : <button onClick={() => { setAuth("login"); setMobileNav(false); }} disabled={checking} className="flex w-full items-center gap-2.5 rounded-xl text-left"><span className="flex h-9 w-9 items-center justify-center rounded-full border border-[#e3e8da] bg-[#f4f6ef] text-[#9aa58c]"><Icon name="user" size={16} /></span><span className="flex-1"><span className="block text-xs font-medium">{checking ? "One moment…" : "A curious visitor"}</span><span className="mt-1 block text-[9px] text-[#98a18e]">Sign in to make it yours</span></span><Icon name="chevron" size={13} className="text-muted" /></button>}</div>
      </div>
    </aside>
    <div className="md:ml-[224px] xl:ml-[238px]">
      <header className="flex h-[77px] items-center justify-between border-b border-[#e4e8df] px-5 sm:px-9 lg:px-11"><div className="flex items-center gap-3"><button aria-label="Open navigation" onClick={() => setMobileNav(true)} className="rounded-lg p-1 md:hidden"><Icon name="menu" size={22} /></button><span className="hidden text-[11px] text-[#a1a999] sm:block">Your little corner of curiosity</span><span className="hidden px-1 text-[10px] text-[#c4cabb] sm:block">/</span><span className="text-[11px] font-medium text-[#6d7b60]">{pageName}</span></div><div className="flex items-center gap-4"><button aria-label="How Quizly works" onClick={() => setHelp(true)} className="rounded-full p-1 text-[#9da58f] hover:text-ink"><Icon name="help" size={18} /></button><span className="h-4 w-px bg-[#e0e5d7]" />{user ? <span className="flex items-center gap-2 text-[11px] text-[#78866a]"><span className="h-1.5 w-1.5 rounded-full bg-[#8da477]" /><span className="max-w-28 truncate">{user.username}</span></span> : <button disabled={checking} onClick={() => setAuth("login")} className="flex items-center gap-2 text-[11px] font-medium text-[#6d7b60] hover:text-ink">Sign in<Icon name="arrow" size={14} /></button>}</div></header>
      <main className="mx-auto max-w-[1230px] px-5 pt-8 pb-6 sm:px-9 lg:px-11 lg:pt-9">
        {notice && <div role="status" className="mb-5 flex items-start justify-between gap-4 rounded-xl border border-[#dedfc9] bg-[#f2f1e5] p-4 text-xs leading-relaxed text-[#80826a]">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss notification"><Icon name="close" size={15} /></button></div>}
        {error && screen !== "home" && <ErrorBanner message={error} />}
        {screen === "home" && <Home user={user} startQuiz={count => void startQuiz(count)} loading={loading || checking} error={error} onSignIn={() => setAuth("register")} />}
        {screen === "quiz" && questions.length > 0 && <Quiz questions={questions} onComplete={attempt => { setResult(attempt); setHistorical(false); setScreen("result"); }} onExit={() => navigate("home")} />}
        {screen === "result" && result && <Results attempt={result} user={user} historical={historical} onPlay={() => navigate("home")} onSignIn={() => setAuth("login")} onHistory={() => navigate("history")} />}
        {screen === "history" && <History key={user?.username || "guest"} user={user} onSignIn={() => setAuth("login")} onPlay={() => navigate("home")} onOpen={attempt => { setResult(attempt); setHistorical(true); setScreen("result"); }} />}
        {screen === "admin" && (user?.is_admin ? <Admin /> : <div className="rounded-2xl border border-[#e2e7dc] bg-white p-10 text-center"><Icon name="shield" size={30} className="mx-auto mb-4 text-muted" /><h1 className="text-xl font-medium">This little corner is for the admin.</h1><button onClick={() => setAuth("login")} className={`${primaryButton} mt-5`}>Sign in</button></div>)}
        <footer className="mt-9 flex flex-wrap items-center justify-between gap-3 border-t border-[#e3e7da] pt-5 text-[9px] text-[#a3aa99]"><p>Made for curious minds, everywhere.</p><span className="flex items-center gap-1.5">A little wiser. A little brighter.<Icon name="spark" size={12} /></span></footer>
      </main>
    </div>
    {auth && <Auth initialMode={auth} onClose={() => setAuth(null)} onSuccess={account => void signedIn(account)} />}
    {help && <Modal onClose={() => setHelp(false)} title="How Quizly works"><span className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-lime"><Icon name="bulb" size={25} /></span><h2 className="text-[29px] font-semibold tracking-[-1px]">A little guide to discovery.</h2><div className="my-7 space-y-6">{[{ title: "Find your spark", text: "Choose 5, 10 or 15 questions. We’ll shuffle a fresh mix of general knowledge just for you." }, { title: "Take your time", text: "Pick one answer per question. There’s no timer, and you can go back before submitting." }, { title: "Meet your aha moment", text: "Submit to see your score and review every answer. Sign in and we’ll save it to your attempts." }].map((step, index) => <div key={step.title} className="flex gap-4"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-mint text-xs">{index + 1}</span><div><h3 className="text-sm font-medium">{step.title}</h3><p className="mt-2 text-xs leading-[1.8] text-muted">{step.text}</p></div></div>)}</div><button onClick={() => setHelp(false)} className={`${primaryButton} w-full`}>Got it. Stay curious.<Icon name="spark" size={16} /></button></Modal>}
  </div>;
}
