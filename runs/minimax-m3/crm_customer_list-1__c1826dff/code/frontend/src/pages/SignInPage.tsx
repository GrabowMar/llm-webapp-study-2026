import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { ApiError } from "../api";
import { useAuth } from "../auth";
import { Alert, Button, TextField } from "../components/ui";

export default function SignInPage() {
  const { username, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  if (username) return <Navigate to="/customers" replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    const trimmed = name.trim();
    if (!trimmed || !password) {
      setFieldErrors({
        ...(trimmed ? {} : { username: "Username is required." }),
        ...(password ? {} : { password: "Password is required." }),
      });
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "signin") {
        await signIn(trimmed, password);
      } else {
        await signUp(trimmed, password);
      }
      navigate("/customers", { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFieldErrors(caught.fields);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const isRegister = mode === "register";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto grid min-h-screen w-full max-w-5xl items-center gap-10 px-4 py-10 lg:grid-cols-2">
        <section className="space-y-5">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-600 text-base font-bold text-white">
              CD
            </span>
            <span className="text-xl font-semibold tracking-tight">Customer Directory</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            One shared place for every customer your team works with.
          </h1>
          <p className="max-w-md text-base leading-relaxed text-slate-600">
            The customer directory keeps names, contact details and notes in one place, and records
            every call, email and meeting your team logs. Everyone signed in sees the same list, so
            two people never call the same customer twice.
          </p>
          <ul className="space-y-2 text-sm text-slate-600">
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
              Search and filter customers by name or company.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
              Keep notes and contact details up to date.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
              Log interactions and see who logged them.
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError(null);
                setFieldErrors({});
              }}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                mode === "signin"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError(null);
                setFieldErrors({});
              }}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                mode === "register"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Create account
            </button>
          </div>

          <h2 className="text-lg font-semibold text-slate-900">
            {isRegister ? "Create your team account" : "Sign in to the directory"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {isRegister
              ? "Pick a username and a password to get access to every customer record."
              : "Use your team username and password."}
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
            {error ? <Alert tone="error">{error}</Alert> : null}
            <TextField
              label="Username"
              name="username"
              value={name}
              onChange={setName}
              error={fieldErrors.username}
              placeholder="alex"
              autoComplete="username"
              required
            />
            <TextField
              label="Password"
              name="password"
              type="password"
              value={password}
              onChange={setPassword}
              error={fieldErrors.password}
              placeholder="••••••••"
              autoComplete={isRegister ? "new-password" : "current-password"}
              required
            />
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Working…" : isRegister ? "Create account" : "Sign in"}
            </Button>
          </form>

          <p className="mt-4 text-center text-xs text-slate-500">
            {isRegister
              ? "Already have an account? Switch to sign in above."
              : "No account yet? Use the registration form above."}
          </p>
        </section>
      </div>
    </div>
  );
}
