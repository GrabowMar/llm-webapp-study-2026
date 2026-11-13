import { FormEvent, useState } from "react";
import { Me, api, setToken } from "./api";

const input =
  "w-full rounded border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500";
const button =
  "rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50";

function Form({
  title,
  submit,
}: {
  title: string;
  submit: (u: string, p: string) => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await submit(username, password);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-label={title}
      className="space-y-3 rounded bg-white p-4 shadow"
    >
      <h2 className="text-lg font-semibold">{title}</h2>
      <label className="block text-sm">
        Username
        <input
          className={input}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
        />
      </label>
      <label className="block text-sm">
        Password
        <input
          className={input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={title === "Register" ? "new-password" : "current-password"}
          required
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button className={button} disabled={busy}>
        {title}
      </button>
    </form>
  );
}

export default function AuthForms({ onSignedIn }: { onSignedIn: (m: Me) => void }) {
  const [notice, setNotice] = useState("");

  async function signIn(username: string, password: string) {
    const { token } = await api<{ token: string }>("/auth/login", "POST", {
      username,
      password,
    });
    setToken(token);
    onSignedIn(await api<Me>("/auth/me"));
  }

  async function register(username: string, password: string) {
    await api("/auth/register", "POST", { username, password });
    setNotice("Account created. You can now sign in.");
  }

  return (
    <div className="space-y-4">
      {notice && (
        <p role="status" className="rounded bg-green-100 p-3 text-sm text-green-800">
          {notice}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Form title="Sign in" submit={signIn} />
        <Form title="Register" submit={register} />
      </div>
    </div>
  );
}
