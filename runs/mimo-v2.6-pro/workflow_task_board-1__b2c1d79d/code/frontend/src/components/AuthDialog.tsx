import { useState, type FormEvent } from "react";
import { ApiError } from "../api";
import {
  FieldError,
  FormError,
  Modal,
  inputClass,
  primaryButtonClass,
} from "./Modal";

interface AuthDialogProps {
  mode: "login" | "register";
  onSubmit: (username: string, password: string) => Promise<void>;
  onClose: () => void;
  onSwitch: (mode: "login" | "register") => void;
}

export function AuthDialog({ mode, onSubmit, onClose, onSwitch }: AuthDialogProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const isLogin = mode === "login";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    setFieldErrors({});
    try {
      await onSubmit(username, password);
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        setFieldErrors(err.fields);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
      setBusy(false);
      return;
    }
    setBusy(false);
  }

  return (
    <Modal title={isLogin ? "Sign in" : "Create an account"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormError message={formError} />
        <div>
          <label htmlFor="auth-username" className="mb-1 block text-sm font-medium text-slate-700">
            Username
          </label>
          <input
            id="auth-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            className={inputClass}
          />
          <FieldError name="username" errors={fieldErrors} />
        </div>
        <div>
          <label htmlFor="auth-password" className="mb-1 block text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            id="auth-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isLogin ? "current-password" : "new-password"}
            className={inputClass}
          />
          <FieldError name="password" errors={fieldErrors} />
        </div>
        <button type="submit" disabled={busy} className={primaryButtonClass}>
          {busy ? "Please wait\u2026" : isLogin ? "Sign in" : "Register"}
        </button>
      </form>
      <p className="mt-4 text-sm text-slate-500">
        {isLogin ? "No account yet?" : "Already have an account?"}{" "}
        <button
          type="button"
          className="font-semibold text-blue-600 hover:underline"
          onClick={() => onSwitch(isLogin ? "register" : "login")}
        >
          {isLogin ? "Register" : "Sign in"}
        </button>
      </p>
    </Modal>
  );
}
