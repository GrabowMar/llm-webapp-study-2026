import { useState } from "react";
import { login, register, setAuth, getUsername } from "./api";

export default function Auth({
  onAuthed,
  isAdmin,
}: {
  onAuthed: () => void;
  isAdmin: boolean;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const currentUser = getUsername();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res =
      mode === "login"
        ? await login(username, password)
        : await register(username, password);
    setBusy(false);

    if (res.ok && "token" in res.data) {
      setAuth(res.data.token, res.data.username);
      onAuthed();
    } else if (res.ok) {
      setMode("login");
      setError("Account created. Sign in to continue.");
      setPassword("");
    } else if ("error" in (res.data as object)) {
      setError((res.data as { error: string }).error);
    } else {
      setError("Something went wrong.");
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-16">
      <h1 className="text-2xl font-bold mb-6">Quiz App</h1>
      {currentUser && (
        <p className="mb-4 text-sm text-gray-600">
          Signed in as <span className="font-semibold">{currentUser}</span>
        </p>
      )}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => {
            setMode("login");
            setError("");
          }}
          className={`px-4 py-2 rounded ${mode === "login" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
        >
          Sign in
        </button>
        <button
          onClick={() => {
            setMode("register");
            setError("");
          }}
          className={`px-4 py-2 rounded ${mode === "register" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
        >
          Register
        </button>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <input
          className="w-full border rounded px-3 py-2"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
        />
        <input
          className="w-full border rounded px-3 py-2"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-blue-600 text-white py-2 rounded disabled:opacity-50"
        >
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
      {isAdmin && mode === "login" && (
        <p className="text-xs text-gray-500 mt-3">Admin sign-in</p>
      )}
    </div>
  );
}
