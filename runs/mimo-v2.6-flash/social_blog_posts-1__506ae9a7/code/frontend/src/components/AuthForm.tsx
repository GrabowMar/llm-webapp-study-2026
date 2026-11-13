import { FormEvent, useState } from "react";
import { ApiError, login, register, saveSession } from "../api";
import { navigate } from "../router";

type Props = {
  mode: "login" | "register";
  note?: string;
  redirectTo?: string;
  onSignedIn: (username: string) => void;
};

export default function AuthForm({ mode, note, redirectTo, onSignedIn }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isRegister = mode === "register";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (isRegister) {
        await register(username, password);
      }
      const token = await login(username, password);
      saveSession(username, token);
      onSignedIn(username);
      navigate(redirectTo ?? "/");
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-2 text-2xl font-bold">{isRegister ? "Register" : "Sign in"}</h1>
      {note && <p className="mb-4 text-sm text-gray-600">{note}</p>}

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <form onSubmit={submit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Username</span>
          <input
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={isRegister ? "new-password" : "current-password"}
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {busy ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="mt-4 text-sm text-gray-600">
        {isRegister ? (
          <>
            Already have an account?{" "}
            <a href="#/login" className="font-medium text-indigo-600 hover:underline">
              Sign in
            </a>
          </>
        ) : (
          <>
            Need an account?{" "}
            <a href="#/register" className="font-medium text-indigo-600 hover:underline">
              Register
            </a>
          </>
        )}
      </p>
    </div>
  );
}
