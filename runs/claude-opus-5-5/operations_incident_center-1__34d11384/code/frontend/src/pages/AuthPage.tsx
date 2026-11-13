import { useState, type FormEvent } from "react";
import { api, ApiError, storeSession } from "../api";
import { Card, ErrorBanner, FieldError, Link, buttonClass, inputClass } from "../ui";
import { navigate } from "../router";

export default function AuthPage({ mode, onSignedIn }: { mode: "login" | "register"; onSignedIn: (u: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const isRegister = mode === "register";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      if (isRegister) {
        await api("/auth/register", { method: "POST", body: { username, password } });
      }
      const res = await api<{ token: string; username?: string }>("/auth/login", {
        method: "POST",
        body: { username, password },
      });
      const name = res.username ?? username;
      storeSession(res.token, name);
      onSignedIn(name);
      navigate("/incidents");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.errors);
      } else {
        setError("Network error");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <Card>
        <h1 className="mb-4 text-xl font-semibold">{isRegister ? "Create an account" : "Sign in"}</h1>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <ErrorBanner message={error} />
          <div>
            <label htmlFor="username" className="mb-1 block text-sm font-medium text-slate-700">
              Username
            </label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              className={inputClass}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <FieldError message={fieldErrors.username} />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <FieldError message={fieldErrors.password} />
          </div>
          <button type="submit" className={`${buttonClass} w-full`} disabled={busy}>
            {isRegister ? "Register" : "Sign in"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-600">
          {isRegister ? (
            <>
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-indigo-600 hover:underline">
                Sign in
              </Link>
            </>
          ) : (
            <>
              No account yet?{" "}
              <Link href="/register" className="font-medium text-indigo-600 hover:underline">
                Register
              </Link>
            </>
          )}
        </p>
      </Card>
    </div>
  );
}
