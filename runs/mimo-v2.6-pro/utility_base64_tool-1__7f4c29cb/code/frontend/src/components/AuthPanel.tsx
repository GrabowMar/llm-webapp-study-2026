import { useState } from "react";
import { login, register } from "../api";

interface Props {
  onSignedIn: (username: string, token: string) => void;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : "something went wrong";
}

export default function AuthPanel({ onSignedIn }: Props) {
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [regUser, setRegUser] = useState("");
  const [regPass, setRegPass] = useState("");
  const [regError, setRegError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const doLogin = async () => {
    setBusy(true);
    setLoginError(null);
    try {
      const res = await login(loginUser, loginPass);
      onSignedIn(loginUser.trim(), res.token);
    } catch (err) {
      setLoginError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const doRegister = async () => {
    setBusy(true);
    setRegError(null);
    try {
      const res = await register(regUser, regPass);
      onSignedIn(res.username, res.token);
    } catch (err) {
      setRegError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200";

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Sign in</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            doLogin();
          }}
          className="space-y-3"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Username
            </label>
            <input
              className={inputClass}
              value={loginUser}
              onChange={(e) => setLoginUser(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              type="password"
              className={inputClass}
              value={loginPass}
              onChange={(e) => setLoginPass(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          {loginError && (
            <p className="text-sm text-red-600" role="alert">
              {loginError}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Sign in
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Create account</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            doRegister();
          }}
          className="space-y-3"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Username
            </label>
            <input
              className={inputClass}
              value={regUser}
              onChange={(e) => setRegUser(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              type="password"
              className={inputClass}
              value={regPass}
              onChange={(e) => setRegPass(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          {regError && (
            <p className="text-sm text-red-600" role="alert">
              {regError}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Register
          </button>
        </form>
      </section>
    </div>
  );
}
