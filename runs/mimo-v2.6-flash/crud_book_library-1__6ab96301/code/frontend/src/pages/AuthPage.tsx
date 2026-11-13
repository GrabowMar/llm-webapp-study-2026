import { FormEvent, useState } from "react";
import { ApiError, apiFetch } from "../api";

type Props = {
  mode: "login" | "register";
  onSignedIn: (token: string, username: string) => void;
  navigate: (path: string) => void;
  banner?: string | null;
};

export default function AuthPage({ mode, onSignedIn, navigate, banner }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(banner ?? null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const isLogin = mode === "login";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      if (isLogin) {
        const res = await apiFetch<{ token: string }>("/api/auth/login", {
          method: "POST",
          body: { username, password },
        });
        onSignedIn(res.token, username);
      } else {
        await apiFetch("/api/auth/register", {
          method: "POST",
          body: { username, password },
        });
        const res = await apiFetch<{ token: string }>("/api/auth/login", {
          method: "POST",
          body: { username, password },
        });
        onSignedIn(res.token, username);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">
          {isLogin ? "Sign in" : "Create an account"}
        </h1>
        {error && (
          <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <form onSubmit={submit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700">
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {fields.username && (
              <p className="mt-1 text-sm text-red-600">{fields.username}</p>
            )}
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {fields.password && (
              <p className="mt-1 text-sm text-red-600">{fields.password}</p>
            )}
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? "Please wait…" : isLogin ? "Sign in" : "Register"}
          </button>
        </form>
        <p className="mt-4 text-sm text-gray-600">
          {isLogin ? (
            <>
              No account yet?{" "}
              <button
                type="button"
                onClick={() => navigate("/register")}
                className="font-medium text-indigo-600 hover:underline"
              >
                Register
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="font-medium text-indigo-600 hover:underline"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
