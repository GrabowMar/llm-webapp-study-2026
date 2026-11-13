import { useState } from "react";
import type { FormEvent } from "react";


interface AuthFormProps {
  mode: "login" | "register";
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister: (username: string, password: string) => Promise<void>;
  onSwitch: () => void;
}

export default function AuthForm({ mode, onLogin, onRegister, onSwitch }: AuthFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "register") {
        await onRegister(username, password);
        setError("Account created. You can now sign in.");
      } else {
        await onLogin(username, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const isLogin = mode === "login";

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900">
        {isLogin ? "Sign in" : "Create account"}
      </h2>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Username</label>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Password</label>
          <input
            type="password"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isLogin ? "current-password" : "new-password"}
            required
          />
        </div>
        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
        </button>
      </form>
      <button
        onClick={onSwitch}
        className="mt-4 text-sm text-blue-600 hover:underline"
      >
        {isLogin ? "Need an account? Register" : "Already have an account? Sign in"}
      </button>
    </div>
  );
}
