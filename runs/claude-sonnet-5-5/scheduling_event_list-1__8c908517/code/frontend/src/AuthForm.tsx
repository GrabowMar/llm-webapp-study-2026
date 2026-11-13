import { useState, type FormEvent } from "react";
import * as api from "./api";
import { Button, Field, Modal, inputClass } from "./ui";

export default function AuthForm({
  mode,
  onClose,
  onSignedIn,
  onSwitch,
}: {
  mode: "login" | "register";
  onClose: () => void;
  onSignedIn: (token: string, username: string) => void;
  onSwitch: (m: "login" | "register") => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setMessage("");
    setBusy(true);
    try {
      if (mode === "register") await api.register(username, password);
      const res = await api.login(username, password);
      onSignedIn(res.token, res.username);
    } catch (err) {
      if (err instanceof api.ApiError) {
        setErrors(err.fieldErrors);
        if (Object.keys(err.fieldErrors).length === 0) setMessage(err.message);
      } else setMessage("Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={mode === "login" ? "Sign in" : "Create account"} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Username" error={errors.username}>
          <input
            className={inputClass}
            name="username"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </Field>
        <Field label="Password" error={errors.password}>
          <input
            className={inputClass}
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {message && (
          <p role="alert" className="mb-3 text-sm text-red-600">
            {message}
          </p>
        )}
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="text-sm text-indigo-600 hover:underline"
            onClick={() => onSwitch(mode === "login" ? "register" : "login")}
          >
            {mode === "login" ? "Need an account? Register" : "Have an account? Sign in"}
          </button>
          <Button type="submit" variant="primary" disabled={busy}>
            {mode === "login" ? "Sign in" : "Register"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
