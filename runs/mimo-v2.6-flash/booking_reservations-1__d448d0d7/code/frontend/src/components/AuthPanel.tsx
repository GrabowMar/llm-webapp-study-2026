import { useState, type FormEvent } from "react";
import { api, ApiError, storeSession } from "../api";
import { card, errorPanel, heading, input, label, primaryButton, successPanel } from "../ui";

interface Props {
  onSignedIn: (username: string) => void;
}

type Mode = "signin" | "register";

export default function AuthPanel({ onSignedIn }: Props) {
  const [mode, setMode] = useState<Mode>("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "register") {
        await api("/api/auth/register", {
          method: "POST",
          body: { username, password },
        });
        setMode("signin");
        setNotice("Account created. Sign in to continue.");
      } else {
        const result = await api<{ token: string }>("/api/auth/login", {
          method: "POST",
          body: { username, password },
        });
        storeSession(username.trim(), result.token);
        setUsername("");
        setPassword("");
        onSignedIn(username.trim());
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const tabClass = (active: boolean) =>
    active
      ? "rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-900 shadow-sm"
      : "rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:text-slate-900";

  return (
    <section className={`${card} mx-auto w-full max-w-md`} aria-label="Account">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className={heading}>Account</h2>
        <div className="flex rounded-lg bg-slate-100 p-1" role="tablist">
          <button
            className={tabClass(mode === "signin")}
            role="tab"
            aria-selected={mode === "signin"}
            type="button"
            onClick={() => {
              setMode("signin");
              setError(null);
              setNotice(null);
            }}
          >
            Sign in
          </button>
          <button
            className={tabClass(mode === "register")}
            role="tab"
            aria-selected={mode === "register"}
            type="button"
            onClick={() => {
              setMode("register");
              setError(null);
              setNotice(null);
            }}
          >
            Register
          </button>
        </div>
      </div>

      {notice && <p className={`${successPanel} mb-4`}>{notice}</p>}
      {error && <p className={`${errorPanel} mb-4`}>{error}</p>}

      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label className={label} htmlFor="auth-username">
            Username
          </label>
          <input
            className={input}
            id="auth-username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </div>
        <div>
          <label className={label} htmlFor="auth-password">
            Password
          </label>
          <input
            className={input}
            id="auth-password"
            type="password"
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        <button className={`${primaryButton} w-full`} type="submit" disabled={busy}>
          {busy ? "Please wait…" : mode === "register" ? "Create account" : "Sign in"}
        </button>
      </form>
    </section>
  );
}
