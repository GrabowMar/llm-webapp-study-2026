import { useState } from "react";
import type { FormEvent } from "react";
import * as api from "../api";
import { ApiError } from "../api";

interface AuthPanelProps {
  token: string | null;
  username: string | null;
  onSignedIn: (token: string, username: string) => void;
  onSignedOut: () => void;
  onError: (message: string | null) => void;
}

export default function AuthPanel({
  token,
  username,
  onSignedIn,
  onSignedOut,
  onError,
}: AuthPanelProps) {
  const [fields, setFields] = useState({ username: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (token) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 px-5 py-4">
        <p className="text-sm text-slate-300">
          Signed in as{" "}
          <span className="font-semibold text-white" data-testid="current-username">
            {username ?? "unknown"}
          </span>
        </p>
        <button
          type="button"
          onClick={() => {
            api.clearSession();
            setFields({ username: "", password: "" });
            setNotice(null);
            onError(null);
            onSignedOut();
          }}
          title="Log out"
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-white"
        >
          Sign out
        </button>
      </div>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onError(null);
    setNotice(null);
    const submitter = (event.nativeEvent as SubmitEvent).submitter as
      | HTMLButtonElement
      | null;
    const chosen: "signin" | "register" =
      submitter?.value === "register" ? "register" : "signin";
    setBusy(true);
    try {
      if (chosen === "register") {
        await api.register(fields.username, fields.password);
        setNotice("Account created. Please sign in.");
        setFields({ username: fields.username, password: "" });
      } else {
        const session = await api.login(fields.username, fields.password);
        api.storeSession(session.token, session.username);
        onSignedIn(session.token, session.username);
      }
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      aria-label="Sign in or Register"
      onSubmit={submit}
      className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
        Sign in or Register
      </h2>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="username" className="text-sm font-medium text-slate-300">
            Username
          </label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            value={fields.username}
            onChange={(event) =>
              setFields((current) => ({ ...current, username: event.target.value }))
            }
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/40"
            placeholder="Username"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-sm font-medium text-slate-300">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={fields.password}
            onChange={(event) =>
              setFields((current) => ({ ...current, password: event.target.value }))
            }
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/40"
            placeholder="Password"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          value="signin"
          disabled={busy}
          title="Log in"
          className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Sign in
        </button>
        <button
          type="submit"
          value="register"
          disabled={busy}
          title="Create account"
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-indigo-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          Register
        </button>
        {notice ? (
          <p className="text-sm text-emerald-300">{notice}</p>
        ) : null}
      </div>
    </form>
  );
}
