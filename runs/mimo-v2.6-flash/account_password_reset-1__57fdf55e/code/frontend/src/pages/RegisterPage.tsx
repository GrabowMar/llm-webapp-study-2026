import { useState, type FormEvent } from "react";
import { api, apiError } from "../api";
import { Link, navigate } from "../router";
import {
  ErrorNotice,
  Field,
  PageTitle,
  buttonClass,
  cardClass,
} from "../ui";

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!username.trim()) {
      setError("Choose a username.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, string> = {
        username: username.trim(),
        password,
      };
      if (email.trim()) {
        body.email = email.trim();
      }
      const result = await api("/api/auth/register", {
        method: "POST",
        body,
      });
      if (result.status === 201) {
        navigate("/login?registered=1");
        return;
      }
      setError(apiError(result, "Registration failed. Please try again."));
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <PageTitle>Create an account</PageTitle>
      <div className={cardClass}>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <form onSubmit={submit} noValidate>
          <Field
            label="Username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
          />
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            placeholder="At least 8 characters"
          />
          <Field
            label="Email (optional)"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
          />
          <p className="mb-4 text-xs text-slate-500">
            An email address lets you receive password reset links. You can add
            one later from the account page.
          </p>
          <button
            type="submit"
            className={`${buttonClass} w-full`}
            disabled={busy}
          >
            {busy ? "Creating…" : "Register"}
          </button>
        </form>
        <p className="mt-4 text-sm text-slate-600">
          Already have an account?{" "}
          <Link to="/login" className="text-sky-700 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
