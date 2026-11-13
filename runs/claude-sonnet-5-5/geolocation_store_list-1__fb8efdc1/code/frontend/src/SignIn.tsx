import { useState } from "react";
import { ApiError, login, setToken } from "./api";

export default function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const { token } = await login(username, password);
      setToken(token);
      setPassword("");
      onSignedIn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 text-sm">
      <label>
        Username
        <input className="ml-1 w-28 rounded border border-slate-300 px-2 py-1" value={username}
          onChange={(e) => setUsername(e.target.value)} />
      </label>
      <label>
        Password
        <input className="ml-1 w-28 rounded border border-slate-300 px-2 py-1" type="password" value={password}
          onChange={(e) => setPassword(e.target.value)} />
      </label>
      <button className="rounded bg-slate-800 px-3 py-1 text-white">Sign in</button>
      {error && <span className="text-red-600" role="alert">{error}</span>}
    </form>
  );
}
