import { useState } from "react";
import { api, ApiError, saveSession } from "../api";
import { Alert, Button, Card, FieldError, Label, TextInput } from "../components";

type Mode = "login" | "register";

export default function AuthView({
  onAuthenticated,
  onBack,
}: {
  onAuthenticated: (username: string) => void;
  onBack: () => void;
}) {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setErrors({});
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setErrors({});
    setLoading(true);
    try {
      const result = mode === "login"
        ? await api.login(username, password)
        : await api.register(username, password);
      const name = result.username || username.trim();
      saveSession(result.token, name);
      onAuthenticated(name);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setErrors(err.errors);
        if (err.status === 401) setPassword("");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg">
            <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Incident Center</h1>
          <p className="mt-1 text-sm text-slate-500">Operations console for incident response</p>
        </div>

        <Card>
          <div className="mb-6 flex rounded-lg bg-slate-100 p-1">
            {(["login", "register"] as const).map((item) => (
              <button
                key={item}
                onClick={() => switchMode(item)}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition ${
                  mode === item ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {item === "login" ? "Sign in" : "Register"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4" noValidate>
            {error && <Alert>{error}</Alert>}
            <div>
              <Label htmlFor="username">Username</Label>
              <TextInput
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="e.g. alice"
                required
              />
              <FieldError errors={errors} name="username" />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <TextInput
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder="••••••••"
                required
              />
              <FieldError errors={errors} name="password" />
            </div>
            <Button type="submit" loading={loading} className="w-full">
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>
        </Card>

        <p className="mt-6 text-center text-xs text-slate-400">
          Team members sign in to open and update incidents. Public figures are available after signing in.
        </p>
      </div>
    </div>
  );
}
