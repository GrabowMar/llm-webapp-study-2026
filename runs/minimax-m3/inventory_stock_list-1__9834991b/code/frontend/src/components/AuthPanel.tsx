import { useState, type FormEvent, type ReactNode } from "react";
import { ApiError } from "../api";
import { useAuth } from "../auth";

function Banner({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  const styles =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`rounded-md border px-3 py-2 text-sm ${styles}`}>
      {children}
    </p>
  );
}

export default function AuthPanel({ onSignedIn }: { onSignedIn?: () => void }) {
  const { login, register } = useAuth();

  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);

  const [registerName, setRegisterName] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerBusy, setRegisterBusy] = useState(false);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoginError(null);
    setLoginBusy(true);
    try {
      await login(loginName.trim(), loginPassword);
      setLoginPassword("");
      onSignedIn?.();
    } catch (error) {
      setLoginError(error instanceof ApiError ? error.message : "Sign in failed. Please try again.");
    } finally {
      setLoginBusy(false);
    }
  };

  const handleRegister = async (event: FormEvent) => {
    event.preventDefault();
    setRegisterError(null);
    setRegisterBusy(true);
    try {
      await register(registerName.trim(), registerPassword);
      setRegisterPassword("");
      onSignedIn?.();
    } catch (error) {
      setRegisterError(
        error instanceof ApiError ? error.message : "Registration failed. Please try again.",
      );
    } finally {
      setRegisterBusy(false);
    }
  };

  return (
    <section
      id="auth-panel"
      aria-label="Account"
      className="mb-8 grid gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2"
    >
      <form onSubmit={handleLogin} className="space-y-3" aria-label="Sign in">
        <h2 className="text-base font-semibold text-slate-900">Sign in</h2>
        <div>
          <label htmlFor="signin-username" className="mb-1 block text-sm font-medium text-slate-700">
            Username
          </label>
          <input
            id="signin-username"
            name="username"
            autoComplete="username"
            value={loginName}
            onChange={(event) => setLoginName(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <div>
          <label htmlFor="signin-password" className="mb-1 block text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            id="signin-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={loginPassword}
            onChange={(event) => setLoginPassword(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        {loginError ? <Banner tone="error">{loginError}</Banner> : null}
        <button
          type="submit"
          disabled={loginBusy}
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
        >
          {loginBusy ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <form onSubmit={handleRegister} className="space-y-3" aria-label="Register">
        <h2 className="text-base font-semibold text-slate-900">Register</h2>
        <div>
          <label htmlFor="register-username" className="mb-1 block text-sm font-medium text-slate-700">
            New username
          </label>
          <input
            id="register-username"
            name="new_username"
            autoComplete="username"
            value={registerName}
            onChange={(event) => setRegisterName(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <div>
          <label htmlFor="register-password" className="mb-1 block text-sm font-medium text-slate-700">
            New password
          </label>
          <input
            id="register-password"
            name="new_password"
            type="password"
            autoComplete="new-password"
            value={registerPassword}
            onChange={(event) => setRegisterPassword(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        {registerError ? <Banner tone="error">{registerError}</Banner> : null}
        <button
          type="submit"
          disabled={registerBusy}
          className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
        >
          {registerBusy ? "Creating account..." : "Register"}
        </button>
      </form>
    </section>
  );
}
