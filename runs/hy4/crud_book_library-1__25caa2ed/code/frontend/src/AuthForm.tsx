import { useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError } from "./api";
import type { Navigate } from "./App";
import { Alert, Button, Field, inputClass } from "./components";
import type { FieldErrors } from "./types";

export default function AuthForm({
  mode,
  navigate,
  onSignedIn,
}: {
  mode: "login" | "register";
  navigate: Navigate;
  onSignedIn: (token: string, username: string) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const isLogin = mode === "login";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors({});
    setMessage("");
    setBusy(true);
    try {
      if (isLogin) {
        const { token } = await api.login(username, password);
        onSignedIn(token, username.trim());
      } else {
        await api.register(username, password);
        const { token } = await api.login(username, password);
        onSignedIn(token, username.trim());
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.errors);
        setMessage(err.message);
      } else {
        setMessage("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-bold text-slate-900">
          {isLogin ? "Sign in" : "Create an account"}
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          {isLogin
            ? "Welcome back to the book library."
            : "Join to add books and write reviews."}
        </p>

        {message && (
          <div className="mb-4">
            <Alert message={message} />
          </div>
        )}

        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Username" name="username" error={errors.username}>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputClass}
              placeholder="your name"
            />
          </Field>
          <Field label="Password" name="password" error={errors.password}>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder="••••••••"
            />
          </Field>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Please wait…" : isLogin ? "Sign in" : "Register"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          {isLogin ? (
            <>
              No account yet?{" "}
              <button
                type="button"
                onClick={() => navigate("/register")}
                className="font-medium text-indigo-600 hover:underline"
              >
                Register
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="font-medium text-indigo-600 hover:underline"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
