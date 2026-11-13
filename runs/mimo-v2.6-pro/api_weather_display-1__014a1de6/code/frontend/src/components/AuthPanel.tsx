import { useState } from "react";
import type { FormEvent } from "react";
import { login, register } from "../api";

interface AuthPanelProps {
  onSignedIn: (username: string, token: string) => void;
}

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200";

export default function AuthPanel({ onSignedIn }: AuthPanelProps) {
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerInfo, setRegisterInfo] = useState<string | null>(null);
  const [registerBusy, setRegisterBusy] = useState(false);

  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);

  async function handleRegister(event: FormEvent) {
    event.preventDefault();
    setRegisterError(null);
    setRegisterInfo(null);
    setRegisterBusy(true);
    try {
      await register(registerUsername, registerPassword);
      setRegisterInfo(`Account created for ${registerUsername}. You can sign in.`);
      setRegisterPassword("");
      setLoginUsername(registerUsername);
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setRegisterBusy(false);
    }
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setLoginError(null);
    setLoginBusy(true);
    try {
      const token = await login(loginUsername, loginPassword);
      onSignedIn(loginUsername, token);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoginBusy(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Create an account</h2>
        <form className="mt-4 space-y-3" onSubmit={handleRegister}>
          <div>
            <label className="block text-sm text-slate-600" htmlFor="register-username">
              Username
            </label>
            <input
              id="register-username"
              className={inputClass}
              value={registerUsername}
              onChange={(e) => setRegisterUsername(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600" htmlFor="register-password">
              Password
            </label>
            <input
              id="register-password"
              type="password"
              className={inputClass}
              value={registerPassword}
              onChange={(e) => setRegisterPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          {registerError ? (
            <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">
              {registerError}
            </p>
          ) : null}
          {registerInfo ? (
            <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-700" role="status">
              {registerInfo}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={registerBusy}
            className="rounded-lg bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            Register
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Sign in</h2>
        <form className="mt-4 space-y-3" onSubmit={handleLogin}>
          <div>
            <label className="block text-sm text-slate-600" htmlFor="login-username">
              Username
            </label>
            <input
              id="login-username"
              className={inputClass}
              value={loginUsername}
              onChange={(e) => setLoginUsername(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600" htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              className={inputClass}
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          {loginError ? (
            <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">
              {loginError}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loginBusy}
            className="rounded-lg bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            Sign in
          </button>
        </form>
      </section>
    </div>
  );
}
