import { useState, type FormEvent } from "react";
import { ApiError } from "../api";

interface AuthFormProps {
  mode: "login" | "register";
  onSuccess: (token: string, username: string) => void;
  onSwitchMode: (mode: "login" | "register") => void;
  submit: (
    username: string,
    password: string,
  ) => Promise<{ token: string; username: string }>;
  onCancel: () => void;
}

export default function AuthForm({
  mode,
  onSuccess,
  onSwitchMode,
  submit,
  onCancel,
}: AuthFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors({});
    setMessage("");
    setBusy(true);
    try {
      const result = await submit(username.trim(), password);
      onSuccess(result.token, result.username);
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.errors);
        setMessage(error.message);
      } else {
        setMessage("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-sky-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Event Calendar</h1>
          <p className="mt-1 text-sm text-slate-500">
            {mode === "login"
              ? "Sign in to create and manage events."
              : "Create an account to get started."}
          </p>
        </div>

        {message && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="auth-username"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Username
            </label>
            <input
              id="auth-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            {errors.username && (
              <p className="mt-1 text-xs text-red-600">{errors.username}</p>
            )}
          </div>
          <div>
            <label
              htmlFor="auth-password"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-600">{errors.password}</p>
            )}
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy
              ? "Please wait…"
              : mode === "login"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

        <div className="mt-5 flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => {
              setErrors({});
              setMessage("");
              onSwitchMode(mode === "login" ? "register" : "login");
            }}
            className="font-medium text-indigo-600 hover:text-indigo-800"
          >
            {mode === "login"
              ? "Need an account? Register"
              : "Have an account? Sign in"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-500 hover:text-slate-700"
          >
            Browse as guest
          </button>
        </div>
      </div>
    </div>
  );
}
