import { useState } from "react";
import * as api from "../lib/api";

interface Props {
  onSignedIn: (token: string, username: string) => void;
}

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm " +
  "focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

const buttonClass =
  "rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm " +
  "hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50";

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

export default function AuthPanel({ onSignedIn }: Props) {
  const [signInUser, setSignInUser] = useState("");
  const [signInPass, setSignInPass] = useState("");
  const [signInError, setSignInError] = useState<string | null>(null);
  const [signInBusy, setSignInBusy] = useState(false);

  const [registerUser, setRegisterUser] = useState("");
  const [registerPass, setRegisterPass] = useState("");
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerBusy, setRegisterBusy] = useState(false);

  async function handleSignIn(event: React.FormEvent) {
    event.preventDefault();
    setSignInError(null);
    setSignInBusy(true);
    try {
      const username = signInUser.trim();
      const { token } = await api.login(username, signInPass);
      onSignedIn(token, username);
    } catch (err) {
      setSignInError(errorText(err));
    } finally {
      setSignInBusy(false);
    }
  }

  async function handleRegister(event: React.FormEvent) {
    event.preventDefault();
    setRegisterError(null);
    setRegisterBusy(true);
    try {
      const username = registerUser.trim();
      await api.register(username, registerPass);
      const { token } = await api.login(username, registerPass);
      onSignedIn(token, username);
    } catch (err) {
      setRegisterError(errorText(err));
    } finally {
      setRegisterBusy(false);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <form
        onSubmit={handleSignIn}
        className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
      >
        <h2 className="text-lg font-semibold text-slate-900">Sign in</h2>
        <p className="mt-1 text-sm text-slate-500">Welcome back — sign in to upload.</p>
        <label className="mt-4 block text-sm font-medium text-slate-700">
          Username
          <input
            className={`${inputClass} mt-1`}
            value={signInUser}
            onChange={(e) => setSignInUser(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label className="mt-3 block text-sm font-medium text-slate-700">
          Password
          <input
            type="password"
            className={`${inputClass} mt-1`}
            value={signInPass}
            onChange={(e) => setSignInPass(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {signInError && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {signInError}
          </p>
        )}
        <button type="submit" className={`${buttonClass} mt-4`} disabled={signInBusy}>
          {signInBusy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <form
        onSubmit={handleRegister}
        className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
      >
        <h2 className="text-lg font-semibold text-slate-900">Create account</h2>
        <p className="mt-1 text-sm text-slate-500">New here? Register to start uploading.</p>
        <label className="mt-4 block text-sm font-medium text-slate-700">
          Username
          <input
            className={`${inputClass} mt-1`}
            value={registerUser}
            onChange={(e) => setRegisterUser(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label className="mt-3 block text-sm font-medium text-slate-700">
          Password
          <input
            type="password"
            className={`${inputClass} mt-1`}
            value={registerPass}
            onChange={(e) => setRegisterPass(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        {registerError && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {registerError}
          </p>
        )}
        <button type="submit" className={`${buttonClass} mt-4`} disabled={registerBusy}>
          {registerBusy ? "Creating…" : "Create account"}
        </button>
      </form>
    </div>
  );
}
