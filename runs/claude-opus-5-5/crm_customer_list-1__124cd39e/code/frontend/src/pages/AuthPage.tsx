import { useState, type FormEvent } from "react";
import { api, ApiError, session, type FieldErrors } from "../api";
import { Alert, Button, Card, Field, TextInput } from "../components/ui";

export default function AuthPage({ onSignedIn }: { onSignedIn: (username: string) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  function switchMode(next: "login" | "register") {
    setMode(next);
    setError("");
    setFieldErrors({});
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setFieldErrors({});
    try {
      if (mode === "register") {
        await api.register(username, password);
      }
      const res = await api.login(username, password);
      const name = res.username ?? username.trim();
      session.save(res.token, name);
      onSignedIn(name);
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.errors);
        if (!Object.keys(err.errors).length) setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  const isLogin = mode === "login";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      <div className="mx-auto grid max-w-5xl gap-10 px-6 py-16 lg:grid-cols-2 lg:items-center lg:py-24">
        <div>
          <div className="flex items-center gap-2 text-indigo-600">
            <span className="flex size-9 items-center justify-center rounded-lg bg-indigo-600 text-lg font-bold text-white">C</span>
            <span className="text-lg font-semibold tracking-tight text-slate-900">Customer Directory</span>
          </div>
          <h1 className="mt-8 text-4xl font-bold tracking-tight text-slate-900">One shared address book for the whole team.</h1>
          <p className="mt-4 text-lg leading-8 text-slate-600">
            Keep every customer's contact details in one place, and log the calls, emails and meetings you have with them so
            everyone knows who was contacted last and what was discussed.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-slate-600">
            <li>• Search and filter customers by name, email or company</li>
            <li>• See when each customer was last contacted</li>
            <li>• Private to signed-in team members, editable by everyone</li>
          </ul>
        </div>

        <Card className="p-8">
          <div className="mb-6 flex rounded-md bg-slate-100 p-1 text-sm font-medium" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={isLogin}
              onClick={() => switchMode("login")}
              className={`flex-1 rounded px-3 py-1.5 ${isLogin ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!isLogin}
              onClick={() => switchMode("register")}
              className={`flex-1 rounded px-3 py-1.5 ${!isLogin ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              Create account
            </button>
          </div>

          <h2 className="text-xl font-semibold text-slate-900">{isLogin ? "Sign in to your account" : "Create a team account"}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {isLogin ? "Welcome back. Enter your username and password." : "Choose a username and a password of at least 8 characters."}
          </p>

          <form className="mt-6 space-y-4" onSubmit={submit} noValidate>
            {error && <Alert>{error}</Alert>}
            <Field label="Username" htmlFor="username" error={fieldErrors.username}>
              <TextInput
                id="username"
                name="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                error={fieldErrors.username}
                required
              />
            </Field>
            <Field label="Password" htmlFor="password" error={fieldErrors.password}>
              <TextInput
                id="password"
                name="password"
                type="password"
                autoComplete={isLogin ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={fieldErrors.password}
                required
              />
            </Field>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
