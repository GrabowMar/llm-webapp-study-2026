import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { ApiResult, ErrorBody } from "./api";
import { formatDuration } from "./format";
import { messageFrom, request } from "./api";

type Mode = "signin" | "register";

type Props = {
  onSignedIn: (token: string) => void;
};

const inputClasses =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200";

const buttonClasses =
  "w-full rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60";

export default function SignInForms({ onSignedIn }: Props) {
  const [mode, setMode] = useState<Mode>("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (remaining <= 0) {
      return;
    }
    const timer = window.setTimeout(
      () => setRemaining((value) => value - 1),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [remaining]);

  const waiting = remaining > 0;

  function switchMode(next: Mode) {
    setMode(next);
    setNotice(null);
    setFailure(null);
    setBlocked(null);
    setRemaining(0);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || waiting) {
      return;
    }
    setBusy(true);
    setNotice(null);
    setFailure(null);
    setBlocked(null);
    const path =
      mode === "signin" ? "/api/auth/login" : "/api/auth/register";
    const result: ApiResult<{ token?: string }> = await request(path, {
      method: "POST",
      body: { username, password },
    });
    setBusy(false);

    if (mode === "register") {
      if (result.status === 201) {
        setNotice("Account created. You can sign in now.");
        setMode("signin");
        setPassword("");
        return;
      }
      setFailure(messageFrom(result));
      return;
    }

    if (result.status === 200 && result.data && result.data.token) {
      onSignedIn(result.data.token);
      return;
    }
    if (result.status === 429) {
      const body = result.data as ErrorBody | null;
      const code = body ? body.code : undefined;
      setBlocked(
        code === "locked"
          ? "This username is locked after repeated failed sign-ins."
          : "Too many sign-in attempts. Please wait before trying again.",
      );
      setRemaining(Math.max(1, Math.ceil(result.retryAfter ?? 60)));
      return;
    }
    setFailure(messageFrom(result));
  }

  return (
    <div className="w-full max-w-md">
      <div className="rounded-2xl bg-white p-8 shadow-lg ring-1 ring-slate-200">
        <h1 className="text-2xl font-semibold text-slate-900">Accounts</h1>
        <p className="mt-1 text-sm text-slate-500">
          {mode === "signin"
            ? "Sign in to view your account."
            : "Create a new account."}
        </p>

        <div className="mt-6 flex rounded-lg bg-slate-100 p-1 text-sm font-medium">
          <button
            type="button"
            onClick={() => switchMode("signin")}
            className={`flex-1 rounded-md px-3 py-2 transition ${
              mode === "signin"
                ? "bg-white text-slate-900 shadow"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => switchMode("register")}
            className={`flex-1 rounded-md px-3 py-2 transition ${
              mode === "register"
                ? "bg-white text-slate-900 shadow"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Register
          </button>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium text-slate-700"
            >
              Username
            </label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className={`mt-1 ${inputClasses}`}
              required
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-700"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={`mt-1 ${inputClasses}`}
              required
            />
          </div>

          {notice && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-emerald-200">
              {notice}
            </p>
          )}
          {failure && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
              {failure}
            </p>
          )}
          {blocked && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
              {blocked}{" "}
              <span className="font-semibold">
                {waiting
                  ? `Try again in ${formatDuration(remaining)}.`
                  : "You can try again now."}
              </span>
            </p>
          )}

          <button
            type="submit"
            disabled={busy || waiting}
            className={buttonClasses}
          >
            {busy
              ? "Please wait..."
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
