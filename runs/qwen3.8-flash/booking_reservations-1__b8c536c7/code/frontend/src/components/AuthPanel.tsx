import { FormEvent, useState } from "react";
import { ApiError, api } from "../api";

export default function AuthPanel({
  onSignedIn,
}: {
  onSignedIn: (username: string, token: string) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "register") {
        await api.register(username, password);
        setInfo("Account created — you can sign in now.");
        setMode("login");
      } else {
        const { token } = await api.login(username, password);
        onSignedIn(username, token);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-10 max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-800">
        {mode === "login" ? "Sign in" : "Create an account"}
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        {mode === "login"
          ? "Book, change and cancel your table reservations."
          : "Pick a username and password to start booking tables."}
      </p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <input
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <input
          type="password"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        {info && (
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {info}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "Working…" : mode === "login" ? "Sign in" : "Register"}
        </button>
      </form>
      <p className="mt-3 text-center text-sm text-slate-500">
        {mode === "login" ? (
          <>
            No account?{" "}
            <button
              className="font-medium text-indigo-600 hover:underline"
              onClick={() => {
                setMode("register");
                setError(null);
              }}
            >
              Register
            </button>
          </>
        ) : (
          <>
            Already registered?{" "}
            <button
              className="font-medium text-indigo-600 hover:underline"
              onClick={() => {
                setMode("login");
                setError(null);
              }}
            >
              Sign in
            </button>
          </>
        )}
      </p>
    </div>
  );
}
