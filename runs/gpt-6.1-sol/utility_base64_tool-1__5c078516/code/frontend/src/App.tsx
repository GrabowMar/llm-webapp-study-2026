import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, errorMessage } from "./api";
import type { Direction, Session } from "./api";
import Icon from "./icons";
import AuthModal from "./AuthModal";
import ApiModal from "./ApiModal";
import History from "./History";

function storedSession(): Session | null {
  try {
    const value = JSON.parse(localStorage.getItem("base64-session") || "null");
    return value && typeof value.token === "string" && typeof value.username === "string" ? value : null;
  } catch { return null; }
}

function persistSession(session: Session | null) {
  try {
    if (session) localStorage.setItem("base64-session", JSON.stringify(session));
    else localStorage.removeItem("base64-session");
  } catch { return; }
}

const features = [
  { icon: "globe" as const, title: "Every character welcome.", description: "UTF-8 text, emojis, and everything in between." },
  { icon: "shield" as const, title: "Private by default.", description: "Nothing is saved unless you choose to save it." },
  { icon: "bolt" as const, title: "Less friction. More flow.", description: "No signup needed. Just paste, convert, and go." },
];

export default function App() {
  const [session, setSession] = useState<Session | null>(storedSession);
  const [authMode, setAuthMode] = useState<"login" | "register" | null>(null);
  const [showApi, setShowApi] = useState(false);
  const [direction, setDirection] = useState<Direction>("encode");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [save, setSave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const outputRef = useRef<HTMLTextAreaElement>(null);
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestVersion = useRef(0);

  const clearSession = useCallback(() => {
    setSession(null);
    setSave(false);
    persistSession(null);
  }, []);

  const sessionExpired = useCallback(() => {
    clearSession();
    setError("Your session has expired. Please sign in again.");
  }, [clearSession]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    api<{ username: string }>("/auth/me", {}, session.token).catch((error) => {
      if (active && error instanceof ApiError && error.status === 401) sessionExpired();
    });
    return () => { active = false; };
  }, [session, sessionExpired]);

  useEffect(() => {
    function sync(event: StorageEvent) {
      if (event.key === "base64-session") {
        setSession(storedSession());
        setSave(false);
        setHistoryRefresh((value) => value + 1);
      }
    }
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("storage", sync);
      if (copyTimeout.current) clearTimeout(copyTimeout.current);
    };
  }, []);

  function authenticated(next: Session) {
    setSession(next);
    persistSession(next);
    setAuthMode(null);
    setError("");
    setNotice("You're signed in. Make yourself at home.");
  }

  async function signOut() {
    setSigningOut(true);
    try {
      if (session) await api("/auth/logout", { method: "POST" }, session.token);
      clearSession();
      setNotice("You're signed out. Your history is safely tucked away.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) clearSession();
      else setError(errorMessage(error));
    } finally { setSigningOut(false); }
  }

  function resetResult() {
    requestVersion.current += 1;
    setOutput(null);
    setError("");
    setNotice("");
    setCopied(false);
  }

  function changeDirection(next: Direction) {
    if (next === direction) return;
    setDirection(next);
    resetResult();
  }

  async function convert() {
    if (busy) return;
    const version = ++requestVersion.current;
    setBusy(true);
    setError("");
    setNotice("");
    setCopied(false);
    try {
      let result: string;
      const saving = save && session;
      if (saving) {
        const conversion = await api<{ output: string }>("/conversions", { method: "POST", body: JSON.stringify({ direction, input }) }, session.token);
        result = conversion.output;
        setHistoryRefresh((value) => value + 1);
      } else {
        const conversion = await api<{ encoded?: string; text?: string }>(`/base64/${direction}`, { method: "POST", body: JSON.stringify(direction === "encode" ? { text: input } : { encoded: input }) });
        result = (direction === "encode" ? conversion.encoded : conversion.text) ?? "";
      }
      if (version === requestVersion.current) {
        setOutput(result);
        setNotice(saving ? "Converted and saved to your private history." : "All done. Your conversion is ready.");
      }
    } catch (error) {
      if (version !== requestVersion.current) return;
      setOutput(null);
      if (error instanceof ApiError && error.status === 401 && save) sessionExpired();
      else setError(errorMessage(error));
    } finally { setBusy(false); }
  }

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      setInput(text);
      resetResult();
      inputRef.current?.focus();
    } catch { setError("Clipboard access is unavailable. Paste directly into the input using Ctrl+V or ⌘V."); }
  }

  async function copy() {
    if (output === null) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(output);
      else {
        outputRef.current?.focus();
        outputRef.current?.select();
        if (!document.execCommand("copy")) throw new Error();
      }
      setCopied(true);
      if (copyTimeout.current) clearTimeout(copyTimeout.current);
      copyTimeout.current = setTimeout(() => setCopied(false), 2200);
    } catch { setError("Couldn't copy automatically. Select the output and copy it manually."); }
  }

  function useOutput() {
    if (output === null || busy) return;
    setInput(output);
    setDirection(direction === "encode" ? "decode" : "encode");
    resetResult();
    inputRef.current?.focus();
  }

  function openHistory() {
    if (!session) setAuthMode("login");
    else document.getElementById("history")?.scrollIntoView({ behavior: "smooth" });
  }

  const isEncoding = direction === "encode";
  const charCount = Array.from(input).length;
  const outputCount = Array.from(output || "").length;

  return <div className="min-h-screen">
    <header className="border-b border-line bg-paper/90">
      <div className="mx-auto flex h-[84px] max-w-[1200px] items-center justify-between gap-5 px-5 sm:px-8">
        <a href="/" aria-label="Base64 home" className="flex shrink-0 items-center gap-2.5 rounded-sm"><span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-forest text-mint"><Icon name="code" className="h-5 w-5" /></span><span className="text-[23px] font-bold tracking-[-1.3px]">base64<span className="text-forest">.</span></span><span className="ml-2 hidden border-l border-line pl-4 text-[9px] font-medium leading-[1.6] tracking-[0.13em] text-muted xl:block">A LITTLE TOOL.<br />A LOT OF POSSIBILITY.</span></a>
        <nav aria-label="Main navigation" className="ml-4 hidden items-center gap-7 md:flex"><a href="#converter" className="flex items-center gap-1.5 rounded-sm text-[13px] font-semibold text-forest"><span className="h-1.5 w-1.5 rounded-full bg-forest" />Converter</a><button onClick={openHistory} className="flex items-center gap-1.5 rounded-sm text-[13px] text-muted transition-colors hover:text-ink">History{!session && <Icon name="lock" className="h-3 w-3" />}</button><button onClick={() => setShowApi(true)} className="rounded-sm text-[13px] text-muted transition-colors hover:text-ink">API reference</button></nav>
        {session ? <div className="flex min-w-0 items-center gap-3"><span className="flex min-w-0 items-center gap-2 text-xs font-medium"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-mint text-forest"><Icon name="user" className="h-3.5 w-3.5" /></span><span className="max-w-[120px] truncate sm:max-w-[160px]">{session.username}</span></span><button disabled={signingOut} onClick={() => void signOut()} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2.5 text-xs text-muted transition-colors hover:border-ink/30 hover:text-ink disabled:opacity-50"><span className="hidden sm:inline">{signingOut ? "Signing out…" : "Sign out"}</span><Icon name="logout" /></button></div> : <div className="flex items-center gap-5"><button onClick={() => setAuthMode("login")} className="rounded-sm text-[13px] font-medium transition-colors hover:text-forest">Sign in</button><button onClick={() => setAuthMode("register")} className="hidden items-center gap-3 rounded-lg bg-ink px-4 py-2.5 text-xs font-medium text-white transition-colors hover:bg-forest sm:flex">Create account<Icon name="arrow" className="h-3.5 w-3.5 -rotate-45" /></button></div>}
      </div>
    </header>

    <main className="mx-auto max-w-[1120px] px-5 pb-12 sm:px-8">
      <section className="relative flex items-center justify-between gap-8 pb-10 pt-14 sm:pb-11 sm:pt-[66px]">
        <div className="relative z-10"><div className="mb-5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-forest"><span className="h-1.5 w-1.5 rounded-full bg-forest" />A simpler way to Base64</div><h1 className="text-[38px] font-semibold leading-[1.15] tracking-[-1.9px] sm:text-[49px] sm:tracking-[-2.4px]">Your text, <span className="text-forest">transformed.</span></h1><p className="mt-5 max-w-[470px] text-[14px] leading-7 text-muted">Encode a thought. Decode a mystery.<br className="hidden sm:block" />A clean, simple Base64 converter that gets out of your way.</p></div>
        <div aria-hidden="true" className="relative mr-2 hidden h-[165px] w-[260px] shrink-0 lg:block">
          <div className="absolute left-6 top-3 h-[145px] w-[224px] rounded-[50%] border border-dashed border-[#ccd8c4] -rotate-[22deg]" />
          <div className="absolute left-11 top-2 h-[145px] w-[180px] rounded-[50%] border border-[#dce4d6] rotate-[28deg]" />
          <div className="absolute left-0 top-12 flex h-[78px] w-[82px] -rotate-[8deg] items-center justify-center rounded-xl border border-[#d5ded0] bg-white font-mono text-[32px] tracking-[-2px] shadow-[0_5px_15px_-8px_rgba(32,53,45,0.15)]">Aa<span className="text-forest">.</span></div>
          <div className="absolute left-[94px] top-[77px] text-forest/60"><Icon name="arrow" className="h-7 w-7" /></div>
          <div className="absolute right-0 top-8 flex h-[86px] w-[94px] rotate-[8deg] items-center justify-center rounded-xl border border-[#d0dec5] bg-[#e7efde] font-mono text-[36px] tracking-[-2px] text-forest shadow-[0_5px_15px_-8px_rgba(32,53,45,0.15)]">64</div>
          <span className="absolute right-9 top-0 h-2 w-2 rounded-full bg-[#94aa85]" /><span className="absolute bottom-2 left-10 text-[20px] font-light text-[#9faf92]">+</span><span className="absolute bottom-0 right-7 font-mono text-[9px] tracking-[0.12em] text-muted">SAME TEXT. NEW FORM.</span>
        </div>
      </section>

      <section id="converter" aria-label="Base64 converter" className="scroll-mt-6 overflow-hidden rounded-xl border border-[#dce2d7] bg-white shadow-[0_6px_30px_-16px_rgba(32,53,45,0.13)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div className="flex gap-1 rounded-lg border border-line bg-paper p-1" role="group" aria-label="Conversion direction"><button onClick={() => changeDirection("encode")} disabled={busy} aria-pressed={isEncoding} className={`flex items-center gap-2 rounded-md px-5 py-2 text-xs font-medium transition-all disabled:opacity-60 ${isEncoding ? "bg-white text-forest shadow-[0_1px_4px_rgba(32,53,45,0.1)]" : "text-muted hover:text-ink"}`}><Icon name="arrow" className="h-3.5 w-3.5" />Encode</button><button onClick={() => changeDirection("decode")} disabled={busy} aria-pressed={!isEncoding} className={`flex items-center gap-2 rounded-md px-5 py-2 text-xs font-medium transition-all disabled:opacity-60 ${!isEncoding ? "bg-white text-forest shadow-[0_1px_4px_rgba(32,53,45,0.1)]" : "text-muted hover:text-ink"}`}><Icon name="arrow" className="h-3.5 w-3.5 rotate-180" />Decode</button></div>
          <span className="flex items-center gap-2 rounded-md border border-line px-2.5 py-1.5 font-mono text-[9px] tracking-[0.06em] text-muted"><span className="h-1 w-1 rounded-full bg-[#779366]" />UTF-8 SUPPORTED</span>
        </div>

        <div className="relative grid gap-5 p-5 sm:gap-6 sm:p-6 md:grid-cols-2">
          <div className="min-w-0"><div className="mb-3 flex h-6 items-center justify-between"><label htmlFor="converter-input" className="flex items-center gap-2 text-xs font-semibold">{isEncoding ? "Plain text" : "Base64 input"}<span className="rounded bg-paper px-1.5 py-0.5 font-mono text-[9px] font-normal text-muted">INPUT</span></label><div className="flex items-center gap-3"><button onClick={() => void paste()} disabled={busy} className="flex items-center gap-1.5 rounded-sm text-[11px] text-muted transition-colors hover:text-forest disabled:opacity-40"><Icon name="clipboard" className="h-3 w-3" />Paste</button><span className="h-3 w-px bg-line" /><button onClick={() => { setInput(""); resetResult(); inputRef.current?.focus(); }} disabled={busy || (!input && output === null)} className="rounded-sm text-[11px] text-muted transition-colors hover:text-forest disabled:opacity-40">Clear</button></div></div>
            <div className="overflow-hidden rounded-lg border border-line bg-[#fcfdfa] transition-colors focus-within:border-forest/50 focus-within:ring-2 focus-within:ring-forest/10"><textarea ref={inputRef} id="converter-input" value={input} disabled={busy} onChange={(event) => { setInput(event.target.value); resetResult(); }} onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void convert(); } }} placeholder={isEncoding ? "Type or paste your text here…" : "Paste your Base64 string here…"} spellCheck={false} className="block h-[205px] w-full resize-y border-0 bg-transparent p-4 font-mono text-[12px] leading-[1.85] text-ink placeholder:text-[#a0a79c] focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-60 sm:h-[223px]" /><div className="flex h-9 items-center justify-between border-t border-line/70 px-4 text-[10px] text-muted"><span>{charCount.toLocaleString()} {charCount === 1 ? "character" : "characters"}</span><button disabled={busy} onClick={() => { setInput(isEncoding ? "Hello, world!" : "SGVsbG8sIHdvcmxkIQ=="); resetResult(); inputRef.current?.focus(); }} className="flex items-center gap-1 rounded-sm text-[10px] text-forest hover:underline disabled:opacity-40">Try an example<Icon name="arrow" className="h-3 w-3" /></button></div></div>
          </div>

          <button onClick={useOutput} disabled={output === null || busy} title="Use output as input and reverse direction" aria-label="Swap input and output" className="absolute left-1/2 top-[157px] z-10 hidden h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-line bg-white text-forest shadow-sm transition-all hover:border-forest/50 hover:bg-mint disabled:text-muted/50 md:flex"><Icon name="swap" className="h-3.5 w-3.5" /></button>

          <div className="min-w-0"><div className="mb-3 flex h-6 items-center justify-between"><label htmlFor="converter-output" className="flex items-center gap-2 text-xs font-semibold">{isEncoding ? "Base64" : "Plain text"}<span className="rounded bg-mint px-1.5 py-0.5 font-mono text-[9px] font-normal text-forest">OUTPUT</span></label><button onClick={() => void copy()} disabled={output === null || busy} className="flex items-center gap-1.5 rounded-sm text-[11px] text-muted transition-colors hover:text-forest disabled:opacity-40"><Icon name={copied ? "check" : "copy"} className="h-3 w-3" />{copied ? "Copied!" : "Copy"}</button></div>
            <div className={`relative overflow-hidden rounded-lg border transition-colors ${output !== null ? "border-[#cbdcc0] bg-[#f4f8f0]" : "border-line bg-[#f4f6f1]"}`}><textarea ref={outputRef} id="converter-output" value={output ?? ""} readOnly placeholder={busy ? "A little transformation in progress…" : isEncoding ? "Your Base64 output will appear here…" : "Your decoded text will appear here…"} spellCheck={false} className="block h-[205px] w-full resize-y border-0 bg-transparent p-4 font-mono text-[12px] leading-[1.85] text-forest placeholder:text-[#a0a79c] focus-visible:ring-inset focus-visible:ring-offset-0 sm:h-[223px]" />{output === "" && <span className="pointer-events-none absolute left-4 top-4 font-mono text-xs text-muted">Empty text — a valid conversion.</span>}<div className="flex h-9 items-center justify-between border-t border-line/70 px-4 text-[10px] text-muted"><span>{outputCount.toLocaleString()} {outputCount === 1 ? "character" : "characters"}</span><span className="flex items-center gap-1.5">{output !== null ? <><Icon name="check" className="h-3 w-3 text-forest" />Ready to copy</> : <><span className="h-1 w-1 rounded-full bg-muted/50" />Awaiting input</>}</span></div></div>
          </div>
        </div>

        {error && <div role="alert" className="mx-5 mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs leading-5 text-red-700 sm:mx-6"><Icon name="info" className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
        <div className="flex flex-col items-stretch justify-between gap-5 border-t border-line bg-[#fdfefb] px-5 py-5 sm:flex-row sm:items-center sm:px-6">
          <div className="flex items-center gap-3"><button role="switch" aria-checked={save} aria-label="Save to history" disabled={!session || busy} onClick={() => setSave(!save)} className={`flex h-5 w-9 shrink-0 items-center rounded-full p-[3px] transition-colors disabled:opacity-65 ${save ? "bg-forest" : "bg-[#dfe4da]"}`}><span className={`h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${save ? "translate-x-4" : "translate-x-0"}`} /></button><div><p className="text-[12px] font-medium">Save to history</p>{session ? <p className="mt-1 flex items-center gap-1 text-[10px] text-muted"><Icon name="lock" className="h-2.5 w-2.5" />Your conversions, just for you.</p> : <p className="mt-1 text-[10px] text-muted"><button onClick={() => setAuthMode("login")} className="rounded-sm text-forest underline decoration-forest/30 underline-offset-2 hover:decoration-forest">Sign in</button> to keep your conversions.</p>}</div></div>
          <div className="flex items-center justify-between gap-5"><span className="hidden text-[10px] text-muted sm:block"><kbd className="rounded border border-line bg-white px-1.5 py-1 font-sans text-[9px]">⌘ / Ctrl</kbd><span className="mx-1">+</span><kbd className="rounded border border-line bg-white px-1.5 py-1 font-sans text-[9px]">Enter</kbd></span><button onClick={() => void convert()} disabled={busy} className="flex min-w-[156px] flex-1 items-center justify-center gap-6 rounded-lg bg-forest px-5 py-3.5 text-xs font-medium text-white shadow-[0_2px_4px_rgba(32,53,45,0.1)] transition-colors hover:bg-ink disabled:opacity-60 sm:flex-none">{busy ? "Converting…" : isEncoding ? "Encode text" : "Decode Base64"}<Icon name="arrow" className="h-4 w-4" /></button></div>
        </div>
      </section>

      <div className="flex min-h-[40px] flex-wrap items-center justify-between gap-2 px-1 py-3 text-[10px] text-muted"><span role="status" className="flex items-center gap-1.5">{notice ? <><Icon name="check" className="h-3 w-3 text-forest" />{notice}</> : <><Icon name="lock" className="h-3 w-3" />{save && session ? "Saving to your private history is on." : "Just a conversion. Nothing stored."}</>}</span><span className="hidden items-center gap-1.5 sm:flex">Standard Base64<span className="mx-1 text-muted/40">/</span>RFC 4648</span></div>

      <section aria-label="Why Base64" className="grid gap-7 py-7 sm:grid-cols-3 sm:gap-8 sm:py-8">{features.map((feature) => <div key={feature.title} className="flex gap-3.5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#e2e8dc] bg-[#eef2e9] text-forest"><Icon name={feature.icon} className="h-[18px] w-[18px]" /></span><div><h2 className="mt-0.5 text-[12px] font-semibold">{feature.title}</h2><p className="mt-1.5 max-w-[245px] text-[11px] leading-[1.7] text-muted">{feature.description}</p></div></div>)}</section>

      <div className="mt-3">{session ? <History key={session.token} token={session.token} refresh={historyRefresh} onExpired={sessionExpired} /> : <section className="relative flex flex-col items-start justify-between gap-5 overflow-hidden rounded-xl border border-[#dce4d5] bg-[#edf2e6] p-6 sm:flex-row sm:items-center sm:px-7 sm:py-6"><div className="flex items-start gap-4"><span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#d7e1cc] bg-[#e5ecdc] text-forest"><Icon name="history" className="h-5 w-5" /></span><div><h2 className="text-[15px] font-semibold tracking-[-0.2px]">Good things are worth keeping.</h2><p className="mt-2 text-[12px] leading-5 text-muted">Save your conversions to a private history. Find them whenever you need them.</p></div></div><button onClick={() => setAuthMode("register")} className="flex shrink-0 items-center gap-4 rounded-lg border border-[#cddac4] bg-[#f8faf5] px-4 py-3 text-[11px] font-semibold text-forest transition-colors hover:border-forest/50 hover:bg-white">Create a free account<Icon name="arrow" className="h-3.5 w-3.5 -rotate-45" /></button></section>}</div>

      <details className="group mt-7 border-b border-line pb-5"><summary className="flex cursor-pointer list-none items-center justify-between rounded-sm py-1 text-xs text-muted"><span className="flex items-center gap-2"><Icon name="info" className="h-3.5 w-3.5" />A quick note on Base64</span><Icon name="plus" className="h-3.5 w-3.5 transition-transform group-open:rotate-45" /></summary><p className="mt-4 max-w-3xl text-xs leading-7 text-muted">Base64 represents data using 64 standard characters, making it easy to move text through systems that expect plain ASCII. This tool encodes UTF-8 text and adds standard padding. When decoding, use a valid Base64 string without spaces or line breaks. Remember: Base64 is encoding, not encryption — never use it to protect sensitive information.</p></details>
      <footer className="flex flex-wrap items-center justify-between gap-4 pt-6 text-[10px] text-muted"><span className="flex items-center gap-2"><Icon name="code" className="h-3.5 w-3.5 text-forest" /><span>Less noise. More utility.</span></span><div className="flex items-center gap-5"><button onClick={() => setShowApi(true)} className="rounded-sm transition-colors hover:text-forest">API reference</button><span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#749565]" />Made for the little things.</span></div></footer>
    </main>

    {authMode && <AuthModal initialMode={authMode} onClose={() => setAuthMode(null)} onSuccess={authenticated} />}
    {showApi && <ApiModal onClose={() => setShowApi(false)} />}
  </div>;
}
