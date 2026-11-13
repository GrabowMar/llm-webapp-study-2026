import { useState, type FormEvent, type JSX } from "react";
import { ApiError, api } from "./api";

interface Props {
  onAuthed: (token: string, username: string) => void;
}

interface FieldErrors {
  form?: string;
  username?: string;
  password?: string;
}

export default function AuthForm({ onAuthed }: Props): JSX.Element {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const res =
        mode === "login"
          ? await api.login(username, password)
          : await api.register(username, password);
      let name = username;
      try {
        name = (await api.me(res.token)).username;
      } catch {
        /* token accepted by /me not critical */
      }
      onAuthed(res.token, name);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors({
          form: err.message,
          username: err.fields.username,
          password: err.fields.password,
        });
      } else {
        setErrors({ form: "network error, please try again" });
      }
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

  return (
    <div className="mx-auto mt-16 w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex rounded-lg bg-slate-100 p-1">
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setErrors({});
            }}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {m === "login" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="username">
            Username
          </label>
          <input
            id="username"
            className={inputCls}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="your name"
            autoComplete="username"
          />
          {errors.username && <p className="mt-1 text-xs text-red-600">{errors.username}</p>}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            className={inputCls}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
          {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password}</p>}
        </div>

        {errors.form && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errors.form}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Working…" : mode === "login" ? "Sign in" : "Register"}
        </button>
      </form>
    </div>
  );
}
