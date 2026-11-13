import { FormEvent, useState } from "react";
import { ApiError, api, setToken } from "../api";
import { btnPrimary, cardCls, inputCls } from "../ui";

function Form({
  mode,
  onSignedIn,
}: {
  mode: "login" | "register";
  onSignedIn: () => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    setFieldErrors({});
    try {
      if (mode === "register") {
        await api("/auth/register", { method: "POST", body: { username, password }, auth: false });
      }
      const { token } = await api<{ token: string }>("/auth/login", {
        method: "POST",
        body: { username, password },
        auth: false,
      });
      setToken(token);
      await onSignedIn();
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.errors);
        setMessage(Object.keys(err.errors).length ? null : err.message);
      } else {
        setMessage("Something went wrong");
      }
      setBusy(false);
    }
  };

  const id = mode;
  return (
    <form onSubmit={submit} className={`${cardCls} space-y-4`} aria-label={mode === "login" ? "Sign in" : "Register"}>
      <h2 className="text-xl font-bold">{mode === "login" ? "Sign in" : "Register"}</h2>
      <div>
        <label htmlFor={`${id}-username`} className="mb-1 block text-sm font-medium">
          Username
        </label>
        <input
          id={`${id}-username`}
          name="username"
          className={inputCls}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
        />
        {fieldErrors.username && <p className="mt-1 text-sm text-red-600">{fieldErrors.username}</p>}
      </div>
      <div>
        <label htmlFor={`${id}-password`} className="mb-1 block text-sm font-medium">
          Password
        </label>
        <input
          id={`${id}-password`}
          name="password"
          type="password"
          className={inputCls}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
        />
        {fieldErrors.password && <p className="mt-1 text-sm text-red-600">{fieldErrors.password}</p>}
      </div>
      {message && (
        <p role="alert" className="text-sm text-red-600">
          {message}
        </p>
      )}
      <button type="submit" disabled={busy} className={btnPrimary}>
        {mode === "login" ? "Sign in" : "Register"}
      </button>
    </form>
  );
}

export default function AuthForms({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Form mode="login" onSignedIn={onSignedIn} />
      <Form mode="register" onSignedIn={onSignedIn} />
    </div>
  );
}
