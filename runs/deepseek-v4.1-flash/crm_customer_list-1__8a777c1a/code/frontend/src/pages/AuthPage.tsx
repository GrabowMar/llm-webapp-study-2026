import { useState } from "react";
import { api, ApiError, setSession } from "../api";
import { Alert, FieldError, inputClass, labelClass } from "../ui";

type Mode = "login" | "register";

export default function AuthPage({ onSignedIn }: { onSignedIn: (username: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  async function perform(mode: Mode) {
    if (busy) return;
    setBusy(true);
    setErrors({});
    setFormError("");

    try {
      if (mode === "register") {
        await api("/auth/register", {
          method: "POST",
          body: { username, password },
        });
      }
      const result = await api<{ token: string }>("/auth/login", {
        method: "POST",
        body: { username, password },
      });
      setSession(result.token, username);
      onSignedIn(username);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.errors);
        setFormError(err.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
      setBusy(false);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    void perform("login");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-sky-600 text-xl font-bold text-white shadow">
            CD
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Customer Directory</h1>
          <p className="mt-2 text-sm text-slate-600">
            A private, shared home for your team&rsquo;s customers. Browse and update
            every account, and keep a running log of calls, emails and meetings.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-slate-900">
            Sign in or create an account
          </h2>

          <form onSubmit={submit} className="space-y-4" noValidate>
            {formError ? <Alert>{formError}</Alert> : null}

            <div>
              <label className={labelClass} htmlFor="username">
                Username
              </label>
              <input
                id="username"
                name="username"
                className={inputClass}
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
              <FieldError message={errors.username} />
            </div>

            <div>
              <label className={labelClass} htmlFor="password">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                className={inputClass}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <FieldError message={errors.password} />
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={busy}
              >
                {busy ? "Please wait…" : "Sign in"}
              </button>
              <button
                type="button"
                onClick={() => void perform("register")}
                className="inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={busy}
              >
                Create account
              </button>
            </div>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          Only signed-in team members can view the directory. New here? Enter a
          username and password, then choose &ldquo;Create account&rdquo;.
        </p>
      </div>
    </div>
  );
}
