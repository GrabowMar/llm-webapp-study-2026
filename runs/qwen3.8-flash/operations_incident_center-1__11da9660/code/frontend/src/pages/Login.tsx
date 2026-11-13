import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { FieldErrors } from "../components/ui";

export default function Login() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string> | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors(null);
    setFormError(null);
    setBusy(true);
    try {
      if (mode === "register") {
        await api.register(username, password);
        const res = await api.login(username, password);
        signIn(res.token, res.username ?? username);
      } else {
        const res = await api.login(username, password);
        signIn(res.token, res.username ?? username);
      }
      navigate("/incidents");
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.details);
        if (!err.details) setFormError(err.message);
      } else {
        setFormError("Unexpected error, please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-12 max-w-md">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex rounded-lg bg-gray-100 p-1">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setErrors(null);
                setFormError(null);
              }}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
                mode === m
                  ? "bg-white text-gray-900 shadow"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {m === "login" ? "Sign in" : "Register"}
            </button>
          ))}
        </div>
        <h1 className="mb-4 text-xl font-semibold text-gray-900">
          {mode === "login" ? "Sign in to the incident center" : "Create an account"}
        </h1>
        {formError && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {formError}
          </div>
        )}
        <form onSubmit={submit} className="space-y-4">
          <FieldErrors errors={errors} />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Username
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy
              ? "Working…"
              : mode === "login"
                ? "Sign in"
                : "Register & sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
