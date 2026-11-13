import { FormEvent, useState } from "react";
import { api } from "./api";
import { inputCls, primaryBtn } from "./ui";

export default function AuthForm({
  onSignedIn,
}: {
  onSignedIn: (username: string, token: string) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const name = username.trim();
      if (mode === "register") await api.register(name, password);
      const token = await api.login(name, password);
      onSignedIn(name, token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const registering = mode === "register";

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-xl font-semibold">
          {registering ? "Create an account" : "Sign in"}
        </h1>
        <label className="block text-sm font-medium">
          Username
          <input
            className={`${inputCls} mt-1`}
            name="username"
            autoComplete="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input
            className={`${inputCls} mt-1`}
            name="password"
            type="password"
            autoComplete={registering ? "new-password" : "current-password"}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button className={`${primaryBtn} w-full`} disabled={busy}>
          {registering ? "Register" : "Sign in"}
        </button>
        <button
          type="button"
          className="w-full text-sm text-indigo-600 hover:underline"
          onClick={() => {
            setMode(registering ? "login" : "register");
            setError("");
          }}
        >
          {registering ? "Have an account? Sign in" : "No account? Register"}
        </button>
      </form>
    </div>
  );
}
