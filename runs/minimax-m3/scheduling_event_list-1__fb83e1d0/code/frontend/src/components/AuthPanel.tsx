import { useState } from "react";

import { ApiError, api } from "../api";
import type { Session } from "../types";

interface AuthPanelProps {
  onSignedIn: (session: Session) => void;
  activeTab: "login" | "register";
  onTabChange: (tab: "login" | "register") => void;
}

export function AuthPanel({ onSignedIn, activeTab, onTabChange }: AuthPanelProps) {
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [loginFields, setLoginFields] = useState<Record<string, string>>({});
  const [registerFields, setRegisterFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setLoginError(null);
    setLoginFields({});
    try {
      const session = await api.login(loginUsername.trim(), loginPassword);
      let username = session.username;
      try {
        username = await api.me();
      } catch {
        /* keep the typed username when the profile lookup is unavailable */
      }
      onSignedIn({ token: session.token, username });
    } catch (error) {
      if (error instanceof ApiError) {
        setLoginError(error.message);
        setLoginFields(error.errors);
      } else {
        setLoginError("Sign in failed. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleRegister(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setRegisterError(null);
    setRegisterFields({});
    try {
      const session = await api.register(registerUsername.trim(), registerPassword);
      onSignedIn(session);
    } catch (error) {
      if (error instanceof ApiError) {
        setRegisterError(error.message);
        setRegisterFields(error.errors);
      } else {
        setRegisterError("Registration failed. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      id="auth-panel"
      className="mx-auto w-full max-w-4xl px-4 pt-6 sm:px-6"
      aria-label="Account"
    >
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {activeTab === "login" ? "Sign in to manage events" : "Create an account"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {activeTab === "login"
                ? "Browsing is open to everyone; signing in lets you create and edit events."
                : "Pick a username and password to start adding events."}
            </p>
          </div>
          <div
            className="inline-flex w-fit rounded-lg border border-slate-200 bg-white p-0.5"
            role="tablist"
            aria-label="Account mode"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "login"}
              onClick={() => onTabChange("login")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                activeTab === "login"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "register"}
              onClick={() => onTabChange("register")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                activeTab === "register"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Register
            </button>
          </div>
        </div>

        {activeTab === "login" ? (
          <form onSubmit={handleLogin} className="space-y-4 px-5 py-5" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Username</span>
                <input
                  name="login-username"
                  value={loginUsername}
                  onChange={(event) => setLoginUsername(event.target.value)}
                  autoComplete="username"
                  placeholder="alice"
                  className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 ${
                    loginFields.username ? "border-red-400" : "border-slate-300"
                  }`}
                />
                {loginFields.username ? (
                  <span className="mt-1 block text-xs text-red-600">{loginFields.username}</span>
                ) : null}
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Password</span>
                <input
                  name="login-password"
                  type="password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="Your password"
                  className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 ${
                    loginFields.password ? "border-red-400" : "border-slate-300"
                  }`}
                />
                {loginFields.password ? (
                  <span className="mt-1 block text-xs text-red-600">{loginFields.password}</span>
                ) : null}
              </label>
            </div>
            {loginError ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{loginError}</p>
            ) : null}
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Signing in..." : "Sign in"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4 px-5 py-5" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Username</span>
                <input
                  name="register-username"
                  value={registerUsername}
                  onChange={(event) => setRegisterUsername(event.target.value)}
                  autoComplete="username"
                  placeholder="choose a username"
                  className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 ${
                    registerFields.username ? "border-red-400" : "border-slate-300"
                  }`}
                />
                {registerFields.username ? (
                  <span className="mt-1 block text-xs text-red-600">{registerFields.username}</span>
                ) : null}
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Password</span>
                <input
                  name="register-password"
                  type="password"
                  value={registerPassword}
                  onChange={(event) => setRegisterPassword(event.target.value)}
                  autoComplete="new-password"
                  placeholder="choose a password"
                  className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 ${
                    registerFields.password ? "border-red-400" : "border-slate-300"
                  }`}
                />
                {registerFields.password ? (
                  <span className="mt-1 block text-xs text-red-600">{registerFields.password}</span>
                ) : null}
              </label>
            </div>
            {registerError ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{registerError}</p>
            ) : null}
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Creating account..." : "Create account"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
