import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ApiError, login, register } from "../api";
import { Alert, Button, Input } from "../components/ui";
import { useAuth } from "../auth";

export default function AuthPage({ mode }: { mode: "login" | "register" }) {
  const isRegister = mode === "register";
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const redirectTo =
    (location.state as { from?: string } | null)?.from ?? "/";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});
    setFormError(null);
    try {
      const result = isRegister
        ? await register(username, password)
        : await login(username, password);
      signIn(result.token, username.trim());
      navigate(redirectTo, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        if (!Object.keys(err.fields).length) setFormError(err.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          {isRegister ? "Create an account" : "Welcome back"}
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          {isRegister
            ? "Register to start sharing your recipes."
            : "Sign in to add and manage your recipes."}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {formError && <Alert>{formError}</Alert>}
          <Input
            label="Username"
            value={username}
            onChange={setUsername}
            autoComplete="username"
            error={errors.username}
            placeholder="e.g. jamie"
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete={isRegister ? "new-password" : "current-password"}
            error={errors.password}
            placeholder="Your password"
          />
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting
              ? "Please wait…"
              : isRegister
                ? "Register"
                : "Sign in"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-stone-500">
          {isRegister ? (
            <>
              Already have an account?{" "}
              <Link
                to="/login"
                className="font-semibold text-amber-700 hover:underline"
              >
                Sign in
              </Link>
            </>
          ) : (
            <>
              New here?{" "}
              <Link
                to="/register"
                className="font-semibold text-amber-700 hover:underline"
              >
                Create an account
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
