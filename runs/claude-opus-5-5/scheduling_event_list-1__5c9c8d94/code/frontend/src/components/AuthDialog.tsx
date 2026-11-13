import { useState, type FormEvent } from "react";
import { ApiError, api } from "../api";
import Modal from "./Modal";

interface AuthDialogProps {
  initialMode: "login" | "register";
  onClose: () => void;
  onSignedIn: (token: string, username: string) => void;
}

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 aria-[invalid=true]:border-red-500";

export default function AuthDialog({ initialMode, onClose, onSignedIn }: AuthDialogProps) {
  const [mode, setMode] = useState(initialMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const switchMode = (next: "login" | "register") => {
    setMode(next);
    setError(null);
    setFieldErrors({});
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      if (mode === "register") {
        await api.register(username, password);
      }
      const res = await api.login(username, password);
      onSignedIn(res.token, res.username ?? username.trim());
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.fieldErrors);
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const isLogin = mode === "login";

  return (
    <Modal title={isLogin ? "Sign in" : "Create an account"} onClose={onClose} size="sm">
      <div className="mb-4 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm font-medium" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={isLogin}
          onClick={() => switchMode("login")}
          className={`rounded-md py-1.5 ${isLogin ? "bg-white text-slate-900 shadow" : "text-slate-600 hover:text-slate-900"}`}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!isLogin}
          onClick={() => switchMode("register")}
          className={`rounded-md py-1.5 ${!isLogin ? "bg-white text-slate-900 shadow" : "text-slate-600 hover:text-slate-900"}`}
        >
          Register
        </button>
      </div>
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <label className="block text-sm font-medium text-slate-700">
          Username
          <input
            name="username"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            aria-invalid={!!fieldErrors.username}
            className={inputClass}
          />
          {fieldErrors.username && <span className="mt-1 block text-xs text-red-600">{fieldErrors.username}</span>}
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Password
          <input
            name="password"
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!fieldErrors.password}
            className={inputClass}
          />
          {fieldErrors.password && <span className="mt-1 block text-xs text-red-600">{fieldErrors.password}</span>}
        </label>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
        </button>
      </form>
    </Modal>
  );
}
