import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Route, Routes, useNavigate, useSearchParams } from "react-router-dom";
import {
  Button,
  ErrorMsg,
  Field,
  Navbar,
  api,
  inputClass,
} from "./components";
import type { User } from "./components";

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      {children}
    </div>
  );
}

function AuthPage({
  mode,
}: {
  mode: "register" | "login";
}) {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const body =
      mode === "register"
        ? { username, password, email }
        : { username, password };
    const res = await api(`/api/auth/${mode}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Something went wrong");
      return;
    }
    if (mode === "login") {
      localStorage.setItem("token", data.token);
      localStorage.setItem("username", username);
      navigate("/account");
    } else {
      navigate("/login");
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <h1 className="mb-4 text-xl font-semibold text-gray-800">
          {mode === "register" ? "Create an account" : "Sign in"}
        </h1>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Username">
            <input
              className={inputClass()}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </Field>
          {mode === "register" && (
            <Field label="Email">
              <input
                className={inputClass()}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
          )}
          <Field label="Password">
            <input
              className={inputClass()}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </Field>
          {mode === "register" && (
            <p className="text-xs text-gray-500">
              Password must be at least 8 characters.
            </p>
          )}
          <ErrorMsg>{error}</ErrorMsg>
          <Button type="submit" className="w-full">
            {mode === "register" ? "Register" : "Sign in"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-gray-600">
          {mode === "register" ? (
            <>
              Already have an account?{" "}
              <a href="/login" className="text-blue-600 hover:underline">
                Sign in
              </a>
            </>
          ) : (
            <>
              <a href="/forgot" className="text-blue-600 hover:underline">
                Forgot password?
              </a>
            </>
          )}
        </p>
      </Card>
    </div>
  );
}

function ForgotPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const body = username ? { username } : { email };
    const res = await api("/api/auth/password-reset", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Something went wrong");
      return;
    }
    setDone(true);
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        {done ? (
          <p className="text-gray-700">
            If the account exists, a reset link is on its way.
          </p>
        ) : (
          <>
            <h1 className="mb-4 text-xl font-semibold text-gray-800">
              Forgot password?
            </h1>
            <form onSubmit={submit} className="space-y-4">
              <Field label="Username">
                <input
                  className={inputClass()}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </Field>
              <p className="text-center text-sm text-gray-500">or</p>
              <Field label="Email">
                <input
                  className={inputClass()}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <ErrorMsg>{error}</ErrorMsg>
              <Button type="submit" className="w-full">
                Send reset link
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}

function ResetPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (pw1 !== pw2) {
      setError("Passwords do not match");
      return;
    }
    const res = await api("/api/auth/password-reset/confirm", {
      method: "POST",
      body: JSON.stringify({ token, new_password: pw1 }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Reset failed");
      return;
    }
    setSuccess(true);
    setTimeout(() => navigate("/login"), 2000);
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        {success ? (
          <p className="text-gray-700">
            Password updated. You can now sign in.
          </p>
        ) : (
          <>
            <h1 className="mb-4 text-xl font-semibold text-gray-800">
              Set a new password
            </h1>
            <form onSubmit={submit} className="space-y-4">
              <Field label="New password">
                <input
                  className={inputClass()}
                  type="password"
                  value={pw1}
                  onChange={(e) => setPw1(e.target.value)}
                  minLength={8}
                  required
                />
              </Field>
              <Field label="Repeat new password">
                <input
                  className={inputClass()}
                  type="password"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  minLength={8}
                  required
                />
              </Field>
              <ErrorMsg>{error}</ErrorMsg>
              <Button type="submit" className="w-full">
                Reset password
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}

function AccountPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [emailErr, setEmailErr] = useState("");
  const [current, setCurrent] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");

  useEffect(() => {
    api("/api/me")
      .then(async (res) => {
        if (res.status === 401) {
          navigate("/login");
          return;
        }
        const data = await res.json();
        setUser(data);
        setEmail(data.email || "");
      })
      .catch(() => {});
  }, [navigate]);

  async function changeEmail(e: FormEvent) {
    e.preventDefault();
    setEmailErr("");
    setEmailMsg("");
    const res = await api("/api/me", {
      method: "PATCH",
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setEmailErr(data.error || "Failed to update email");
      return;
    }
    setUser(data);
    setEmail(data.email || "");
    setEmailMsg("Email updated");
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPwErr("");
    setPwMsg("");
    const res = await api("/api/me/password", {
      method: "POST",
      body: JSON.stringify({
        current_password: current,
        new_password: newPw,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPwErr(data.error || "Failed to change password");
      return;
    }
    setCurrent("");
    setNewPw("");
    setPwMsg("Password changed");
  }

  if (!user) return null;

  return (
    <div className="mx-auto max-w-md space-y-6">
      <Card>
        <h1 className="text-xl font-semibold text-gray-800">Account</h1>
        <p className="mt-2 text-sm text-gray-700">
          Username: <span className="font-medium">{user.username}</span>
        </p>
        <p className="text-sm text-gray-700">
          Email:{" "}
          <span className="font-medium">{user.email || "(none)"}</span>
        </p>
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-gray-800">
          Change email
        </h2>
        <form onSubmit={changeEmail} className="space-y-4">
          <Field label="Email address">
            <input
              className={inputClass()}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <ErrorMsg>{emailErr}</ErrorMsg>
          {emailMsg && <p className="text-sm text-green-600">{emailMsg}</p>}
          <Button type="submit">Save email</Button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-gray-800">
          Change password
        </h2>
        <form onSubmit={changePassword} className="space-y-4">
          <Field label="Current password">
            <input
              className={inputClass()}
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </Field>
          <Field label="New password">
            <input
              className={inputClass()}
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              minLength={8}
              required
            />
          </Field>
          <ErrorMsg>{pwErr}</ErrorMsg>
          {pwMsg && <p className="text-sm text-green-600">{pwMsg}</p>}
          <Button type="submit">Change password</Button>
        </form>
      </Card>
    </div>
  );
}

type Message = {
  id: number;
  to: string;
  subject: string;
  body: string;
  sent_at: string;
};

function MailboxPage() {
  const [to, setTo] = useState("");
  const [items, setItems] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  async function load(e: FormEvent) {
    e.preventDefault();
    if (!to) return;
    setLoading(true);
    const res = await api(`/api/outbox?to=${encodeURIComponent(to)}`);
    const data = await res.json();
    setItems(data.items || []);
    setLoading(false);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card>
        <h1 className="mb-4 text-xl font-semibold text-gray-800">Mailbox</h1>
        <form onSubmit={load} className="flex gap-2">
          <input
            className={inputClass("flex-1")}
            type="email"
            placeholder="Email address"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          <Button type="submit">Check</Button>
        </form>
      </Card>

      <div className="space-y-4">
        {loading && <p className="text-sm text-gray-500">Loading…</p>}
        {!loading && items.length === 0 && to && (
          <p className="text-sm text-gray-500">No messages for {to}.</p>
        )}
        {items.map((m) => (
          <div
            key={m.id}
            className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">{m.subject}</h3>
              <span className="text-xs text-gray-500">{m.sent_at}</span>
            </div>
            <p className="mt-1 text-xs text-gray-500">To: {m.to}</p>
            <pre className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
              {m.body}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Routes>
          <Route path="/" element={<AuthPage mode="login" />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/forgot" element={<ForgotPage />} />
          <Route path="/reset" element={<ResetPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/mailbox" element={<MailboxPage />} />
        </Routes>
      </main>
    </div>
  );
}
