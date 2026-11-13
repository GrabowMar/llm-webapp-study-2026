import { useMemo, useState, type FormEvent } from "react";
import { useAuth } from "./auth";
import { ErrorBanner } from "./components";

export default function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isRegister = mode === "register";
  const heading = useMemo(
    () => (isRegister ? "Create your account" : "Welcome back"),
    [isRegister],
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (isRegister) await register(username, password);
      else await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function switchMode() {
    setMode(isRegister ? "login" : "register");
    setError("");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-xl font-bold text-white">
            M
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Markdown Notes
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Write privately, publish when you are ready.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex rounded-lg bg-slate-100 p-1 text-sm font-medium">
            <button
              type="button"
              onClick={() => mode !== "login" && switchMode()}
              className={
                mode === "login"
                  ? "flex-1 rounded-md bg-white py-1.5 text-slate-900 shadow-sm"
                  : "flex-1 rounded-md py-1.5 text-slate-500 hover:text-slate-700"
              }
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => mode !== "register" && switchMode()}
              className={
                mode === "register"
                  ? "flex-1 rounded-md bg-white py-1.5 text-slate-900 shadow-sm"
                  : "flex-1 rounded-md py-1.5 text-slate-500 hover:text-slate-700"
              }
            >
              Register
            </button>
          </div>

          <h2 className="mb-4 text-lg font-semibold text-slate-900">{heading}</h2>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="username"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Username
              </label>
              <input
                id="username"
                autoComplete="username"
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete={isRegister ? "new-password" : "current-password"}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <ErrorBanner>{error}</ErrorBanner>

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-slate-500">
            {isRegister ? "Already have an account?" : "No account yet?"}{" "}
            <button
              type="button"
              onClick={switchMode}
              className="font-medium text-indigo-600 hover:text-indigo-700"
            >
              {isRegister ? "Sign in" : "Register"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
