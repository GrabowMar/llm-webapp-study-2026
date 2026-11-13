import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { api, extractErrors, getToken, saveSession } from "../api";

export default function SignIn() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (getToken()) {
    navigate("/", { replace: true });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      if (mode === "register") {
        await api.register(username, password);
        const { token } = await api.login(username, password);
        saveSession(token, username);
      } else {
        const { token } = await api.login(username, password);
        saveSession(token, username);
      }
      navigate("/", { replace: true });
    } catch (err) {
      setErrors(extractErrors((err as { body?: unknown }).body));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-slate-900">Customer Directory</h1>
          <p className="mt-2 text-sm text-slate-600">
            A shared, private directory for your team. Track customers and log calls,
            emails, and meetings all in one place.
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex gap-1 rounded-md bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setErrors({});
              }}
              className={`flex-1 rounded px-3 py-1.5 text-sm font-medium ${
                mode === "signin" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setErrors({});
              }}
              className={`flex-1 rounded px-3 py-1.5 text-sm font-medium ${
                mode === "register" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
              }`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {errors.form && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {errors.form}
              </p>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Username
              </label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                autoComplete="username"
              />
              {errors.username && (
                <p className="mt-1 text-sm text-red-600">{errors.username}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                autoComplete={mode === "register" ? "new-password" : "current-password"}
              />
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">{errors.password}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? "Please wait…" : mode === "register" ? "Create account" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
