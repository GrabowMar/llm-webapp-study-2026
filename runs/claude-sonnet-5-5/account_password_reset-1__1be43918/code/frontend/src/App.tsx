import { useCallback, useEffect, useState } from "react";
import { api, ApiError, getToken, setToken, type Me, type Message } from "./api";
import { btnCls, Card, Field, Notice } from "./ui";

function useRoute() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const on = () => setPath(window.location.pathname);
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  const go = useCallback((to: string) => {
    window.history.pushState({}, "", to);
    setPath(to.split("?")[0]);
  }, []);
  return { path: path.replace(/\/+$/, "") || "/", go };
}

const msg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

function Link({ to, go, children }: { to: string; go: (t: string) => void; children: React.ReactNode }) {
  return (
    <a
      href={to}
      className="text-indigo-600 hover:underline"
      onClick={(e) => {
        e.preventDefault();
        go(to);
      }}
    >
      {children}
    </a>
  );
}

function Register({ go }: { go: (t: string) => void }) {
  const [f, setF] = useState({ username: "", email: "", password: "" });
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setOk(null);
    try {
      await api("POST", "/auth/register", {
        username: f.username,
        password: f.password,
        email: f.email || undefined,
      });
      setOk("Account created. You can sign in now.");
      setF({ username: "", email: "", password: "" });
    } catch (e) {
      setErr(msg(e));
    }
  };
  return (
    <Card title="Register">
      <form onSubmit={submit}>
        <Notice error={err} ok={ok} />
        <Field label="Username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} required autoComplete="username" />
        <Field label="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" />
        <Field label="Password (min. 8 characters)" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={8} autoComplete="new-password" />
        <button className={btnCls}>Register</button>
      </form>
      <p className="mt-3 text-sm text-slate-500">
        Already registered? <Link to="/" go={go}>Sign in</Link>
      </p>
    </Card>
  );
}

function SignIn({ onDone, go }: { onDone: () => void; go: (t: string) => void }) {
  const [f, setF] = useState({ username: "", password: "" });
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      const r = await api<{ token: string }>("POST", "/auth/login", f);
      setToken(r.token);
      onDone();
    } catch (e) {
      setErr(msg(e));
    }
  };
  return (
    <Card title="Sign in">
      <form onSubmit={submit}>
        <Notice error={err} />
        <Field label="Username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} required autoComplete="username" />
        <Field label="Password" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required autoComplete="current-password" />
        <button className={btnCls}>Sign in</button>
      </form>
      <p className="mt-3 text-sm text-slate-500">
        <Link to="/forgot" go={go}>Forgot password?</Link> · <Link to="/register" go={go}>Create an account</Link>
      </p>
    </Card>
  );
}

function Forgot({ go }: { go: (t: string) => void }) {
  const [id, setId] = useState("");
  const [done, setDone] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = id.trim();
    try {
      await api("POST", "/auth/password-reset", v.includes("@") ? { email: v } : { username: v });
    } catch {
      /* always show the same answer */
    }
    setDone(true);
  };
  return (
    <Card title="Forgot password?">
      <form onSubmit={submit}>
        {done && <Notice ok="If the account exists, a reset link is on its way" />}
        <Field label="Username or email" value={id} onChange={(e) => setId(e.target.value)} required />
        <button className={btnCls}>Send reset link</button>
      </form>
      <p className="mt-3 text-sm text-slate-500">
        <Link to="/" go={go}>Back to sign in</Link> · <Link to="/mailbox" go={go}>Mailbox</Link>
      </p>
    </Card>
  );
}

function Reset({ go }: { go: (t: string) => void }) {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (p1 !== p2) return setErr("The passwords do not match");
    try {
      await api("POST", "/auth/password-reset/confirm", { token, new_password: p1 });
      setToken(null);
      setOk(true);
    } catch (e) {
      setErr(msg(e));
    }
  };
  if (!token)
    return (
      <Card title="Reset password">
        <Notice error="This reset link is missing its token." />
      </Card>
    );
  if (ok)
    return (
      <Card title="Reset password">
        <Notice ok="Your password has been changed." />
        <Link to="/" go={go}>Sign in</Link>
      </Card>
    );
  return (
    <Card title="Reset password">
      <form onSubmit={submit}>
        <Notice error={err} />
        <Field label="New password" type="password" value={p1} onChange={(e) => setP1(e.target.value)} required minLength={8} autoComplete="new-password" />
        <Field label="Repeat new password" type="password" value={p2} onChange={(e) => setP2(e.target.value)} required minLength={8} autoComplete="new-password" />
        <button className={btnCls}>Set new password</button>
      </form>
    </Card>
  );
}

function Account({ me, refresh }: { me: Me; refresh: () => void }) {
  const [email, setEmail] = useState(me.email ?? "");
  const [eErr, setEErr] = useState<string | null>(null);
  const [eOk, setEOk] = useState<string | null>(null);
  const [pw, setPw] = useState({ current: "", next: "", again: "" });
  const [pErr, setPErr] = useState<string | null>(null);
  const [pOk, setPOk] = useState<string | null>(null);

  const saveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEErr(null);
    setEOk(null);
    try {
      await api("PATCH", "/me", { email: email.trim() || null });
      setEOk("Email address saved.");
      refresh();
    } catch (e) {
      setEErr(msg(e));
    }
  };
  const savePw = async (e: React.FormEvent) => {
    e.preventDefault();
    setPErr(null);
    setPOk(null);
    if (pw.next !== pw.again) return setPErr("The new passwords do not match");
    try {
      await api("POST", "/me/password", { current_password: pw.current, new_password: pw.next });
      setPOk("Password changed.");
      setPw({ current: "", next: "", again: "" });
    } catch (e) {
      setPErr(msg(e));
    }
  };
  return (
    <>
      <Card title="Account">
        <dl className="text-sm">
          <dt className="font-medium text-slate-700">Username</dt>
          <dd className="mb-2">{me.username}</dd>
          <dt className="font-medium text-slate-700">Email</dt>
          <dd data-testid="account-email">{me.email ?? "No email address (password reset is unavailable)"}</dd>
        </dl>
      </Card>
      <Card title="Edit email">
        <form onSubmit={saveEmail}>
          <Notice error={eErr} ok={eOk} />
          <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <button className={btnCls}>Save email</button>
        </form>
      </Card>
      <Card title="Change password">
        <form onSubmit={savePw}>
          <Notice error={pErr} ok={pOk} />
          <Field label="Current password" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required autoComplete="current-password" />
          <Field label="New password" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required minLength={8} autoComplete="new-password" />
          <Field label="Repeat new password" type="password" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} required minLength={8} autoComplete="new-password" />
          <button className={btnCls}>Change password</button>
        </form>
      </Card>
    </>
  );
}

function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} className="break-all text-indigo-600 underline">
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function Mailbox() {
  const [addr, setAddr] = useState("");
  const [items, setItems] = useState<Message[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setErr(null);
    try {
      const r = await api<{ items: Message[] }>("GET", `/outbox?to=${encodeURIComponent(addr.trim())}`);
      setItems(r.items);
    } catch (e) {
      setItems(null);
      setErr(msg(e));
    }
  };
  return (
    <Card title="Mailbox">
      <form onSubmit={load} className="mb-4">
        <Field label="Email address" type="email" value={addr} onChange={(e) => setAddr(e.target.value)} required />
        <button className={btnCls}>Show messages</button>
      </form>
      <Notice error={err} />
      {items && items.length === 0 && <p className="text-sm text-slate-500">No messages.</p>}
      {items?.map((m) => (
        <article key={m.id} className="mb-3 rounded border border-slate-200 p-3 text-sm">
          <h3 className="font-semibold">{m.subject}</h3>
          <p className="mb-2 text-xs text-slate-500">
            To: {m.to} · {new Date(m.sent_at).toLocaleString()}
          </p>
          <pre className="whitespace-pre-wrap font-sans">
            <Linkified text={m.body} />
          </pre>
        </article>
      ))}
    </Card>
  );
}

export default function App() {
  const { path, go } = useRoute();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(!!getToken());

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setMe(null);
      setLoading(false);
      return;
    }
    try {
      setMe(await api<Me>("GET", "/me"));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setToken(null);
      setMe(null);
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const signOut = async () => {
    try {
      await api("POST", "/auth/logout");
    } catch {
      /* ignore */
    }
    setToken(null);
    setMe(null);
    go("/");
  };

  let page: React.ReactNode;
  if (path === "/reset") page = <Reset go={go} />;
  else if (path === "/forgot") page = <Forgot go={go} />;
  else if (path === "/mailbox") page = <Mailbox />;
  else if (loading) page = <p className="text-sm text-slate-500">Loading…</p>;
  else if (path === "/account" && me) page = <Account me={me} refresh={refresh} />;
  else if (me)
    page = (
      <Card title="Welcome">
        <p className="text-sm">
          Signed in as <strong>{me.username}</strong>. <Link to="/account" go={go}>Manage your account</Link>
        </p>
      </Card>
    );
  else if (path === "/register") page = <Register go={go} />;
  else
    page = (
      <SignIn
        go={go}
        onDone={async () => {
          await refresh();
          go("/");
        }}
      />
    );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="border-b border-slate-200 bg-white">
        <nav className="mx-auto flex max-w-xl items-center gap-4 px-4 py-3 text-sm">
          <Link to="/" go={go}><span className="font-semibold">Accounts</span></Link>
          {me && <Link to="/account" go={go}>Account</Link>}
          <Link to="/mailbox" go={go}>Mailbox</Link>
          <span className="ml-auto flex items-center gap-3">
            {me && (
              <>
                <span data-testid="username">{me.username}</span>
                <button onClick={signOut} className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-100">
                  Sign out
                </button>
              </>
            )}
          </span>
        </nav>
      </header>
      <main className="mx-auto max-w-xl px-4 py-8">{page}</main>
    </div>
  );
}
