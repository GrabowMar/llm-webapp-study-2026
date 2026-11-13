import { useState, type FormEvent } from "react";
import { ApiError, api } from "../api";
import type { Session } from "../types";

type AuthPanelProps = {
  onSignedIn: (session: Session) => void;
};

function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

export default function AuthPanel({ onSignedIn }: AuthPanelProps) {
  const [registerName, setRegisterName] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  async function handleRegister(event: FormEvent) {
    event.preventDefault();
    setRegisterError(null);
    setRegistering(true);
    try {
      const result = await api.register(registerName.trim(), registerPassword);
      onSignedIn({ token: result.token, username: result.username });
    } catch (error) {
      setRegisterError(messageFor(error));
    } finally {
      setRegistering(false);
    }
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setLoginError(null);
    setSigningIn(true);
    try {
      const result = await api.login(loginName.trim(), loginPassword);
      onSignedIn({ token: result.token, username: result.username || loginName.trim() });
    } catch (error) {
      setLoginError(messageFor(error));
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-4 py-12">
      <header className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Link previews</h1>
        <p className="mt-2 text-slate-600">
          Save the links you like and keep a preview of every page.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Create an account</h2>
          <p className="mt-1 text-sm text-slate-500">Register to start saving links.</p>
          <form className="mt-5 space-y-4" onSubmit={handleRegister}>
            <div>
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="register-username"
              >
                Username
              </label>
              <input
                id="register-username"
                name="username"
                autoComplete="username"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                value={registerName}
                onChange={(event) => setRegisterName(event.target.value)}
                required
              />
            </div>
            <div>
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="register-password"
              >
                Password
              </label>
              <input
                id="register-password"
                name="password"
                type="password"
                autoComplete="new-password"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                value={registerPassword}
                onChange={(event) => setRegisterPassword(event.target.value)}
                required
              />
            </div>
            {registerError ? (
              <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {registerError}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={registering}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {registering ? "Creating account…" : "Create account"}
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Welcome back, pick up where you left off.</p>
          <form className="mt-5 space-y-4" onSubmit={handleLogin}>
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="login-username">
                Username
              </label>
              <input
                id="login-username"
                name="username"
                autoComplete="username"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                value={loginName}
                onChange={(event) => setLoginName(event.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="login-password">
                Password
              </label>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                required
              />
            </div>
            {loginError ? (
              <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {loginError}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={signingIn}
              className="w-full rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {signingIn ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
