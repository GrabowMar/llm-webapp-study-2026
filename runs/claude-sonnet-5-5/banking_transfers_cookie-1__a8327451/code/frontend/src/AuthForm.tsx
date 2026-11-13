import { FormEvent, useState } from "react";
import { ApiError, api, setToken } from "./api";

const input =
  "w-full rounded border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none";

export default function AuthForm({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const login = async () => {
    const { token } = await api<{ token: string }>("POST", "/auth/login", {
      username,
      password,
    });
    setToken(token);
    await onSignedIn();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setBusy(true);
    try {
      if (mode === "register") {
        await api("POST", "/auth/register", { username, password });
        setInfo("Account created.");
      }
      await login();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="mx-auto max-w-sm space-y-4 rounded-lg bg-white p-6 shadow"
    >
      <h1 className="text-xl font-semibold">
        {mode === "login" ? "Sign in" : "Create account"}
      </h1>
      <label className="block text-sm">
        Username
        <input
          className={input}
          name="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </label>
      <label className="block text-sm">
        Password
        <input
          className={input}
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={mode === "register" ? 8 : undefined}
        />
      </label>
      {mode === "register" && (
        <p className="text-xs text-slate-500">
          Username: 3-32 letters, digits, ".", "_" or "-". Password: at least 8 characters.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {info && <p className="rounded bg-green-50 p-2 text-sm text-green-700">{info}</p>}
      <button
        disabled={busy}
        className="w-full rounded bg-blue-600 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {mode === "login" ? "Sign in" : "Register"}
      </button>
      <button
        type="button"
        onClick={() => {
          setMode(mode === "login" ? "register" : "login");
          setError("");
          setInfo("");
        }}
        className="w-full text-sm text-blue-600 hover:underline"
      >
        {mode === "login" ? "No account? Register" : "Have an account? Sign in"}
      </button>
    </form>
  );
}
