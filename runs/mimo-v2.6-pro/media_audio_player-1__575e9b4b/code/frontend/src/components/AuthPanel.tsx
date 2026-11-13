import { useState } from "react";
import type { FormEvent } from "react";
import * as api from "../api";

interface Props {
  onSignedIn: (username: string) => void;
}

export default function AuthPanel({ onSignedIn }: Props) {
  const [tab, setTab] = useState<"signin" | "register">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (tab === "signin") {
        await api.login({ username, password });
        onSignedIn(username.trim());
      } else {
        await api.register({ username, password });
        setNotice("Account created. You can now sign in.");
        setTab("signin");
        setPassword("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const switchTab = (next: "signin" | "register") => {
    setTab(next);
    setError("");
    setNotice("");
    setPassword("");
  };

  const field =
    "w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-emerald-500 focus:outline-none";

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-5">
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => switchTab("signin")}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            tab === "signin"
              ? "bg-emerald-500 text-neutral-950"
              : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => switchTab("register")}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            tab === "register"
              ? "bg-emerald-500 text-neutral-950"
              : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
          }`}
        >
          Register
        </button>
      </div>

      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-400">
            Username
          </span>
          <input
            className={field}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-400">
            Password
          </span>
          <input
            className={field}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={tab === "signin" ? "current-password" : "new-password"}
            required
          />
        </label>
        <div className="sm:col-span-2 flex items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-emerald-500 px-5 py-2 text-sm font-semibold text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            {busy ? "Working…" : tab === "signin" ? "Sign in" : "Create account"}
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
          {notice && <p className="text-sm text-emerald-400">{notice}</p>}
        </div>
      </form>
    </section>
  );
}
