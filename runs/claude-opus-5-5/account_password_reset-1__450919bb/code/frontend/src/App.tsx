import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api, tokenStore, type Message, type User } from "./api";

function usePath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return path;
}

export function navigate(to: string) {
  window.history.pushState(null, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function Link({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={to}
      className={className ?? "text-indigo-600 hover:underline"}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

const inputCls =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";
const btnCls =
  "rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50";

function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input className={inputCls} {...props} />
    </label>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

function Notice({ kind, children }: { kind: "error" | "success" | "info"; children: ReactNode }) {
  const cls = {
    error: "border-red-200 bg-red-50 text-red-700",
    success: "border-green-200 bg-green-50 text-green-700",
    info: "border-indigo-200 bg-indigo-50 text-indigo-700",
  }[kind];
  return (
    <p role={kind === "error" ? "alert" : "status"} className={`rounded-md border px-3 py-2 text-sm ${cls}`}>
      {children}
    </p>
  );
}

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong";
}

function LoginPage({ onLogin }: { onLogin: (token: string) => Promise<void> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { token } = await api<{ token: string }>("POST", "/auth/login", { username, password });
      await onLogin(token);
      navigate("/account");
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Sign in">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
        <Field label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        {error && <Notice kind="error">{error}</Notice>}
        <div className="flex items-center justify-between">
          <button className={btnCls} disabled={busy}>Sign in</button>
          <Link to="/forgot">Forgot password?</Link>
        </div>
        <p className="text-sm text-slate-600">
          No account yet? <Link to="/register">Register</Link>
        </p>
      </form>
    </Card>
  );
}

function RegisterPage({ onLogin }: { onLogin: (token: string) => Promise<void> }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }
    setBusy(true);
    try {
      await api("POST", "/auth/register", { username, password, email: email.trim() || null });
      const { token } = await api<{ token: string }>("POST", "/auth/login", { username, password });
      await onLogin(token);
      navigate("/account");
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Create an account">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
        <Field label="Email (optional, needed for password reset)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <Field label="Password (at least 8 characters)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
        {error && <Notice kind="error">{error}</Notice>}
        <button className={btnCls} disabled={busy}>Register</button>
        <p className="text-sm text-slate-600">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </Card>
  );
}

const FORGOT_MESSAGE = "If the account exists, a reset link is on its way";

function ForgotPage() {
  const [identifier, setIdentifier] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const value = identifier.trim();
    try {
      await api("POST", "/auth/password-reset", value.includes("@") ? { email: value, username: value } : { username: value });
    } catch {
      /* the answer is always the same */
    } finally {
      setBusy(false);
      setSent(true);
    }
  }

  return (
    <Card title="Forgot password?">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-600">Enter your username or email address and we will send you a reset link.</p>
        <Field label="Username or email" value={identifier} onChange={(e) => { setIdentifier(e.target.value); setSent(false); }} required />
        {sent && <Notice kind="info">{FORGOT_MESSAGE}</Notice>}
        <div className="flex items-center justify-between">
          <button className={btnCls} disabled={busy}>Send reset link</button>
          <Link to="/mailbox">Open mailbox</Link>
        </div>
      </form>
    </Card>
  );
}

function ResetPage() {
  const [token] = useState(() => new URLSearchParams(window.location.search).get("token") ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Password must be at least 8 characters long");
    if (password !== confirm) return setError("The passwords do not match");
    setBusy(true);
    try {
      await api("POST", "/auth/password-reset/confirm", { token, new_password: password });
      setDone(true);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <Card title="Reset password">
        <Notice kind="error">This reset link is missing its token.</Notice>
        <p className="mt-4 text-sm"><Link to="/forgot">Request a new link</Link></p>
      </Card>
    );
  }
  if (done) {
    return (
      <Card title="Reset password">
        <Notice kind="success">Your password has been changed.</Notice>
        <p className="mt-4 text-sm"><Link to="/login">Sign in with your new password</Link></p>
      </Card>
    );
  }
  return (
    <Card title="Choose a new password">
      <form onSubmit={submit} className="space-y-4">
        <Field label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
        <Field label="Repeat new password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" minLength={8} required />
        {error && <Notice kind="error">{error}</Notice>}
        <button className={btnCls} disabled={busy}>Set new password</button>
      </form>
    </Card>
  );
}

function AccountPage({ user, onUser }: { user: User; onUser: (u: User) => void }) {
  const [email, setEmail] = useState(user.email ?? "");
  const [emailMsg, setEmailMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [pwMsg, setPwMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setEmail(user.email ?? ""), [user.email]);

  async function saveEmail(e: FormEvent) {
    e.preventDefault();
    setEmailMsg(null);
    setBusy(true);
    try {
      const u = await api<User>("PATCH", "/me", { email: email.trim() || null });
      onUser(u);
      setEmailMsg({ kind: "success", text: "Email address saved." });
    } catch (err) {
      setEmailMsg({ kind: "error", text: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (next.length < 8) return setPwMsg({ kind: "error", text: "New password must be at least 8 characters long" });
    if (next !== repeat) return setPwMsg({ kind: "error", text: "The new passwords do not match" });
    setBusy(true);
    try {
      await api("POST", "/me/password", { current_password: current, new_password: next });
      setCurrent("");
      setNext("");
      setRepeat("");
      setPwMsg({ kind: "success", text: "Password changed." });
    } catch (err) {
      setPwMsg({ kind: "error", text: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card title="Account">
        <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
          <dt className="text-slate-500">Username</dt>
          <dd className="font-medium">{user.username}</dd>
          <dt className="text-slate-500">Email</dt>
          <dd className="font-medium">{user.email ?? <span className="text-slate-400">none — password reset is unavailable</span>}</dd>
        </dl>
      </Card>
      <Card title="Edit email address">
        <form onSubmit={saveEmail} className="space-y-4">
          <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          {emailMsg && <Notice kind={emailMsg.kind}>{emailMsg.text}</Notice>}
          <button className={btnCls} disabled={busy}>Save email</button>
        </form>
      </Card>
      <Card title="Change password">
        <form onSubmit={changePassword} className="space-y-4">
          <Field label="Current password" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
          <Field label="New password" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} required />
          <Field label="Repeat new password" type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" minLength={8} required />
          {pwMsg && <Notice kind={pwMsg.kind}>{pwMsg.text}</Notice>}
          <button className={btnCls} disabled={busy}>Change password</button>
        </form>
      </Card>
    </div>
  );
}

function linkify(text: string) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return parts.map((p, i) =>
    /^https?:\/\//.test(p) ? (
      <a
        key={i}
        href={p}
        className="break-all text-indigo-600 hover:underline"
        onClick={(e) => {
          const url = new URL(p);
          if (url.pathname === "/reset" && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            navigate(url.pathname + url.search);
          }
        }}
      >
        {p}
      </a>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function MailboxPage({ defaultAddress }: { defaultAddress: string }) {
  const initial = new URLSearchParams(window.location.search).get("to") ?? defaultAddress;
  const [address, setAddress] = useState(initial);
  const [shown, setShown] = useState(initial);
  const [items, setItems] = useState<Message[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async (to: string) => {
    setError("");
    if (!to.trim()) {
      setItems(null);
      return;
    }
    try {
      const data = await api<{ items: Message[] }>("GET", `/outbox?to=${encodeURIComponent(to.trim())}`);
      setItems(data.items);
      setOpen(data.items[0]?.id ?? null);
    } catch (err) {
      setError(errMsg(err));
    }
  }, []);

  useEffect(() => {
    load(shown);
  }, [shown, load]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const to = address.trim();
    window.history.replaceState(null, "", to ? `/mailbox?to=${encodeURIComponent(to)}` : "/mailbox");
    if (to === shown) load(to);
    else setShown(to);
  }

  return (
    <Card title="Mailbox">
      <form onSubmit={submit} className="mb-4 flex gap-2">
        <input className={inputCls} type="email" placeholder="you@example.com" value={address} onChange={(e) => setAddress(e.target.value)} aria-label="Email address" required />
        <button className={btnCls}>Open</button>
      </form>
      {error && <Notice kind="error">{error}</Notice>}
      {items && items.length === 0 && <p className="text-sm text-slate-500">No messages for {shown}.</p>}
      {items && items.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
          {items.map((m) => (
            <li key={m.id}>
              <button className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50" onClick={() => setOpen(open === m.id ? null : m.id)}>
                <span className="font-medium text-slate-900">{m.subject}</span>
                <span className="text-xs text-slate-500">{new Date(m.sent_at).toLocaleString()}</span>
              </button>
              {open === m.id && (
                <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-sm">
                  <p className="mb-2 text-xs text-slate-500">To: {m.to}</p>
                  <pre className="font-sans whitespace-pre-wrap text-slate-800">{linkify(m.body)}</pre>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function App() {
  const path = usePath();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) {
      setUser(null);
      return;
    }
    try {
      setUser(await api<User>("GET", "/me"));
    } catch {
      tokenStore.clear();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  async function onLogin(token: string) {
    tokenStore.set(token);
    await refresh();
  }

  async function signOut() {
    try {
      await api("POST", "/auth/logout");
    } catch {
      /* ignore */
    }
    tokenStore.clear();
    setUser(null);
    navigate("/login");
  }

  let page: ReactNode;
  if (loading) page = <p className="text-sm text-slate-500">Loading…</p>;
  else if (path === "/register") page = <RegisterPage onLogin={onLogin} />;
  else if (path === "/forgot") page = <ForgotPage />;
  else if (path === "/reset") page = <ResetPage />;
  else if (path === "/mailbox") page = <MailboxPage defaultAddress={user?.email ?? ""} />;
  else if (user && (path === "/account" || path === "/")) page = <AccountPage user={user} onUser={setUser} />;
  else page = <LoginPage onLogin={onLogin} />;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <nav className="mx-auto flex max-w-2xl items-center gap-4 px-4 py-3 text-sm">
          <Link to="/" className="font-semibold text-slate-900">Accounts</Link>
          {user && <Link to="/account">Account</Link>}
          <Link to="/mailbox">Mailbox</Link>
          <div className="ml-auto flex items-center gap-3">
            {user ? (
              <>
                <span className="text-slate-600">
                  Signed in as <strong data-testid="username">{user.username}</strong>
                </span>
                <button onClick={signOut} className="rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-50">Sign out</button>
              </>
            ) : (
              <>
                <Link to="/login">Sign in</Link>
                <Link to="/register">Register</Link>
              </>
            )}
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8">{page}</main>
    </div>
  );
}
