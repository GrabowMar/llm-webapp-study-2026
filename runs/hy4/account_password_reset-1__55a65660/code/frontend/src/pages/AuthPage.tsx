import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { errorMessage } from "../api";
import { useAuth } from "../auth";
import { Alert, Button, Card, Field, TextInput } from "../components";

type Mode = "login" | "register";

export default function AuthPage() {
  const { account, signIn, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "login") {
        await signIn(username, password);
      } else {
        await register(username, password, email);
      }
      navigate("/account");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (account) {
    return (
      <div className="flex flex-col items-center gap-4">
        <Card title="You are signed in" subtitle={`Welcome, ${account.username}.`}>
          <Link to="/account">
            <Button className="w-full">Go to your account</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <Card
        title={mode === "login" ? "Sign in" : "Create an account"}
        subtitle={
          mode === "login"
            ? "Use your username and password."
            : "Pick a username and a password of at least 8 characters."
        }
      >
        <div className="mb-6 flex rounded-lg bg-slate-100 p-1">
          {(["login", "register"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setMode(option);
                setError("");
              }}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                mode === option
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {option === "login" ? "Sign in" : "Register"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Username">
            <TextInput
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              placeholder="jane"
            />
          </Field>

          {mode === "register" && (
            <Field label="Email address (optional)">
              <TextInput
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="jane@example.com"
              />
            </Field>
          )}

          <Field label="Password">
            <TextInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              required
              minLength={8}
              placeholder="At least 8 characters"
            />
          </Field>

          {error && <Alert tone="error">{error}</Alert>}

          <Button type="submit" disabled={busy} className="w-full">
            {busy
              ? "Please wait…"
              : mode === "login"
                ? "Sign in"
                : "Create account"}
          </Button>
        </form>

        {mode === "login" && (
          <p className="mt-4 text-center text-sm">
            <Link
              to="/forgot-password"
              className="font-medium text-indigo-600 hover:underline"
            >
              Forgot password?
            </Link>
          </p>
        )}
      </Card>
    </div>
  );
}
