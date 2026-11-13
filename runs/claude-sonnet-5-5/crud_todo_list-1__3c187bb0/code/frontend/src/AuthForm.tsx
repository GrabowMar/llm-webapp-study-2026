import { FormEvent, useState } from "react";
import { api, ApiError, setToken } from "./api";

export const inputCls =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
export const btnCls =
  "rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50";

export default function AuthForm({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFields({});
    setMessage("");
    try {
      if (mode === "register") await api.register(username, password);
      const { token } = await api.login(username.trim(), password);
      setToken(token);
      onSignedIn();
    } catch (err) {
      if (err instanceof ApiError) {
        setFields(err.fields);
        if (Object.keys(err.fields).length === 0) setMessage(err.message);
        if (mode === "register" && err.status !== 400 && err.status !== 409) setMessage(err.message);
      } else setMessage("Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-16 w-full max-w-sm rounded-xl bg-white p-6 shadow">
      <h1 className="mb-4 text-2xl font-semibold text-slate-800">
        {mode === "login" ? "Sign in" : "Create account"}
      </h1>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm text-slate-600" htmlFor="username">
            Username
          </label>
          <input
            id="username"
            className={inputCls}
            value={username}
            autoComplete="username"
            onChange={(e) => setUsername(e.target.value)}
          />
          {fields.username && <p className="mt-1 text-sm text-red-600">{fields.username}</p>}
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-600" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            className={inputCls}
            value={password}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            onChange={(e) => setPassword(e.target.value)}
          />
          {fields.password && <p className="mt-1 text-sm text-red-600">{fields.password}</p>}
        </div>
        {message && <p className="text-sm text-red-600">{message}</p>}
        <button className={`${btnCls} w-full`} disabled={busy}>
          {mode === "login" ? "Sign in" : "Register"}
        </button>
      </form>
      <button
        type="button"
        className="mt-4 text-sm text-indigo-600 hover:underline"
        onClick={() => {
          setMode(mode === "login" ? "register" : "login");
          setFields({});
          setMessage("");
        }}
      >
        {mode === "login" ? "Need an account? Register" : "Have an account? Sign in"}
      </button>
    </div>
  );
}
