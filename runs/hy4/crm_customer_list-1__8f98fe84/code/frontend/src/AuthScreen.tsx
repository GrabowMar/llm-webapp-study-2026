import { useState } from "react";
import * as api from "./api";
import { Button, ErrorBanner, Field, TextInput } from "./components";
import { errorParts } from "./utils";
import type { FieldErrors } from "./types";

export default function AuthScreen({
  onAuthenticated,
}: {
  onAuthenticated: () => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  function switchMode(next: "login" | "register") {
    setMode(next);
    setMessage("");
    setErrors({});
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    setErrors({});
    try {
      const fn = mode === "login" ? api.login : api.register;
      const result = await fn(username, password);
      api.setToken(result.token);
      onAuthenticated();
    } catch (err) {
      const parts = errorParts(err);
      setMessage(parts.message);
      setErrors(parts.errors);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-xl md:grid-cols-2">
        <div className="bg-indigo-600 p-10 text-white">
          <h1 className="text-3xl font-bold">Customer Directory</h1>
          <p className="mt-4 text-indigo-100">
            A private, shared directory for your team. Keep every customer in one
            place and log calls, emails and meetings so everyone stays in the
            loop.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-indigo-50">
            <li>• One shared list, visible to all signed-in members</li>
            <li>• Search, filter and page through customers</li>
            <li>• A complete interaction history per customer</li>
          </ul>
          <p className="mt-8 text-xs text-indigo-200">
            Access is restricted to signed-in team members.
          </p>
        </div>

        <div className="p-10">
          <h2 className="text-xl font-semibold text-slate-900">
            {mode === "login" ? "Sign in" : "Create an account"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {mode === "login"
              ? "Welcome back. Enter your details to continue."
              : "Register to join the team directory."}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <ErrorBanner message={message} />
            <Field label="Username" name="username" errors={errors}>
              <TextInput
                id="username"
                name="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                invalid={!!errors.username}
                placeholder="your.name"
              />
            </Field>
            <Field label="Password" name="password" errors={errors}>
              <TextInput
                id="password"
                name="password"
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                invalid={!!errors.password}
                placeholder="••••••••"
              />
            </Field>
            <Button type="submit" disabled={busy} className="w-full">
              {busy
                ? "Please wait…"
                : mode === "login"
                  ? "Sign in"
                  : "Create account"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            {mode === "login" ? (
              <>
                Need an account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("register")}
                  className="font-semibold text-indigo-600 hover:underline"
                >
                  Register
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="font-semibold text-indigo-600 hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
