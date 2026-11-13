import { useState, type FormEvent } from "react";
import { ApiError, login, register, type User } from "../api";
import Modal from "./Modal";

interface AuthDialogProps {
  mode: "login" | "register";
  onModeChange: (mode: "login" | "register") => void;
  onClose: () => void;
  onAuthed: (user: User) => void;
}

export default function AuthDialog({
  mode,
  onModeChange,
  onClose,
  onAuthed,
}: AuthDialogProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrors([]);
    setBusy(true);
    try {
      const user =
        mode === "login"
          ? await login(username, password)
          : await register(username, password);
      onAuthed(user);
    } catch (error) {
      setErrors(
        error instanceof ApiError ? error.errors : ["Something went wrong"],
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={mode === "login" ? "Sign in" : "Create account"}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
        {errors.length > 0 && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
            {errors.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        )}
        <div>
          <label
            htmlFor="auth-username"
            className="block text-sm font-medium text-slate-700"
          >
            Username
          </label>
          <input
            id="auth-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoFocus
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
        </div>
        <div>
          <label
            htmlFor="auth-password"
            className="block text-sm font-medium text-slate-700"
          >
            Password
          </label>
          <input
            id="auth-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
        </div>
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => {
              setErrors([]);
              onModeChange(mode === "login" ? "register" : "login");
            }}
            className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline"
          >
            {mode === "login"
              ? "Need an account? Register"
              : "Have an account? Sign in"}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {busy
                ? "Working…"
                : mode === "login"
                  ? "Sign in"
                  : "Register"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
