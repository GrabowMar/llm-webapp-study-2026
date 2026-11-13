import { useState } from "react";
import { ApiError, login, register, type Session } from "../api";

interface Props {
  onAuthed: (session: Session) => void;
}

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200";
const buttonClass =
  "w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50";

function ErrorBanner({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {message}
    </p>
  );
}

export default function AuthForms({ onAuthed }: Props) {
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regError, setRegError] = useState<string | null>(null);
  const [regBusy, setRegBusy] = useState(false);

  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRegError(null);
    if (!regUsername.trim() || !regPassword) {
      setRegError("Enter a username and a password.");
      return;
    }
    setRegBusy(true);
    try {
      await register(regUsername.trim(), regPassword);
      const session = await login(regUsername.trim(), regPassword);
      onAuthed(session);
    } catch (err) {
      setRegError(
        err instanceof ApiError ? err.message : "Registration failed.",
      );
    } finally {
      setRegBusy(false);
    }
  };

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError(null);
    if (!loginUsername.trim() || !loginPassword) {
      setLoginError("Enter a username and a password.");
      return;
    }
    setLoginBusy(true);
    try {
      const session = await login(loginUsername.trim(), loginPassword);
      onAuthed(session);
    } catch (err) {
      setLoginError(err instanceof ApiError ? err.message : "Sign in failed.");
    } finally {
      setLoginBusy(false);
    }
  };

  return (
    <section className="grid gap-4 md:grid-cols-2" aria-label="Account">
      <form
        onSubmit={handleRegister}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Create account
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Register to upload and delete images.
          </p>
        </div>
        {regError && <ErrorBanner message={regError} />}
        <div>
          <label
            htmlFor="register-username"
            className="block text-sm font-medium text-slate-700"
          >
            Username
          </label>
          <input
            id="register-username"
            name="username"
            type="text"
            autoComplete="username"
            value={regUsername}
            onChange={(e) => setRegUsername(e.target.value)}
            className={inputClass}
            required
          />
        </div>
        <div>
          <label
            htmlFor="register-password"
            className="block text-sm font-medium text-slate-700"
          >
            Password
          </label>
          <input
            id="register-password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={regPassword}
            onChange={(e) => setRegPassword(e.target.value)}
            className={inputClass}
            required
          />
        </div>
        <button type="submit" disabled={regBusy} className={buttonClass}>
          {regBusy ? "Creating account..." : "Register"}
        </button>
      </form>

      <form
        onSubmit={handleLogin}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div>
          <h2 className="text-base font-semibold text-slate-900">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">
            Sign in to upload images.
          </p>
        </div>
        {loginError && <ErrorBanner message={loginError} />}
        <div>
          <label
            htmlFor="login-username"
            className="block text-sm font-medium text-slate-700"
          >
            Username
          </label>
          <input
            id="login-username"
            name="username"
            type="text"
            autoComplete="username"
            value={loginUsername}
            onChange={(e) => setLoginUsername(e.target.value)}
            className={inputClass}
            required
          />
        </div>
        <div>
          <label
            htmlFor="login-password"
            className="block text-sm font-medium text-slate-700"
          >
            Password
          </label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
            className={inputClass}
            required
          />
        </div>
        <button type="submit" disabled={loginBusy} className={buttonClass}>
          {loginBusy ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </section>
  );
}
