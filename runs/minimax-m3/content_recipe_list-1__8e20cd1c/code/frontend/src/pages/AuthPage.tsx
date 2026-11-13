import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../api";
import { useAuth } from "../auth";
import TextField from "../components/TextField";

interface AuthPageProps {
  mode: "signin" | "register";
}

export default function AuthPage({ mode }: AuthPageProps) {
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isRegister = mode === "register";

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setBusy(true);
    try {
      if (isRegister) {
        await register(username.trim(), password);
      } else {
        await login(username.trim(), password);
      }
      navigate("/", { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors);
        if (Object.keys(error.fieldErrors).length === 0) setFormError(error.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="font-display text-3xl font-bold text-stone-900">
          {isRegister ? "Create an account" : "Sign in"}
        </h1>
        <p className="text-sm text-stone-600">
          {isRegister
            ? "Register to add recipes and manage the ones you wrote."
            : "Sign in to add recipes and manage the ones you wrote."}
        </p>
      </div>

      {formError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {formError}
        </p>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-5 rounded-xl border border-stone-200 bg-white p-6 shadow-sm"
      >
        <TextField
          id="username"
          label="Username"
          value={username}
          onChange={setUsername}
          error={fieldErrors.username}
          placeholder="your-name"
        />
        <TextField
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          error={fieldErrors.password}
          placeholder="your password"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Please wait..." : isRegister ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="text-center text-sm text-stone-600">
        {isRegister ? "Already have an account? " : "New here? "}
        <Link
          to={isRegister ? "/signin" : "/register"}
          className="font-semibold text-amber-700 hover:underline"
        >
          {isRegister ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </div>
  );
}
