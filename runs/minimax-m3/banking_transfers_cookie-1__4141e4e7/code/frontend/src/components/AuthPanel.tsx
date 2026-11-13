import { useState } from "react";

interface AuthPanelProps {
  onSubmit: (
    mode: "login" | "register",
    username: string,
    password: string,
  ) => Promise<void>;
  busy: boolean;
  error: string | null;
}

export default function AuthPanel({ onSubmit, busy, error }: AuthPanelProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const isRegister = mode === "register";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(mode, username.trim(), password);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/15 ring-1 ring-indigo-400/40">
            <svg
              viewBox="0 0 24 24"
              className="h-7 w-7 text-indigo-300"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 10.5 12 4l9 6.5M5 9.5V20h14V9.5M9.5 20v-5.5h5V20"
              />
            </svg>
          </div>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white">
            Meridian Bank
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Send money, track every transfer, stay in control.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/40 backdrop-blur">
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-800/60 p-1">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                !isRegister
                  ? "bg-slate-900 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode("register")}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                isRegister
                  ? "bg-slate-900 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Create account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="username"
                className="mb-1.5 block text-sm font-medium text-slate-300"
              >
                Username
              </label>
              <input
                id="username"
                name="username"
                value={username}
                autoComplete="username"
                autoFocus
                onChange={(event) => setUsername(event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3.5 py-2.5 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30"
                placeholder="e.g. alice"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-slate-300"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                value={password}
                autoComplete={isRegister ? "new-password" : "current-password"}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3.5 py-2.5 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30"
                placeholder="••••••••"
              />
            </div>

            {error ? (
              <p
                role="alert"
                className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-200"
              >
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy
                ? "Please wait…"
                : isRegister
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-slate-500">
            {isRegister
              ? "New accounts start with a $1,000.00 balance."
              : "New here? Switch to “Create account” to get started."}
          </p>
        </div>
      </div>
    </div>
  );
}
