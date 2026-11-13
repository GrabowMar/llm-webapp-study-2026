import { useState, type FormEvent } from "react";
import { api, apiError, setToken, type Account } from "../api";
import { Link } from "../router";
import {
  ErrorNotice,
  Field,
  Notice,
  PageTitle,
  buttonClass,
  cardClass,
} from "../ui";

export default function LoginPage({
  onSignedIn,
}: {
  onSignedIn: (account: Account) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const registered =
    new URLSearchParams(window.location.search).get("registered") === "1";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!username || !password) {
      setError("Enter your username and password.");
      return;
    }
    setBusy(true);
    try {
      const login = await api<{ token: string }>("/api/auth/login", {
        method: "POST",
        body: { username, password },
      });
      if (login.status !== 200 || !login.data?.token) {
        setError(apiError(login, "Invalid username or password."));
        return;
      }
      setToken(login.data.token);
      const me = await api<Account>("/api/me");
      if (me.status === 200 && me.data) {
        onSignedIn(me.data);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <PageTitle>Sign in</PageTitle>
      <div className={cardClass}>
        {registered && (
          <Notice>
            Your account was created. Sign in to continue.
          </Notice>
        )}
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
            autoComplete="current-password"
          />
          <button
            type="submit"
            className={`${buttonClass} w-full`}
            disabled={busy}
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <div className="mt-4 flex flex-col gap-1 text-sm text-slate-600">
          <Link to="/forgot" className="text-sky-700 hover:underline">
            Forgot password?
          </Link>
          <span>
            No account?{" "}
            <Link to="/register" className="text-sky-700 hover:underline">
              Register
            </Link>
          </span>
        </div>
      </div>
    </div>
  );
}
