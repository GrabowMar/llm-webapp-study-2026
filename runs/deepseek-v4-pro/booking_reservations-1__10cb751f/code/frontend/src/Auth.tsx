import { FormEvent, useState } from "react";
import { api, ApiError, setSession } from "./api";
import { Button, Card, ErrorBox, TextInput } from "./ui";

export default function Auth({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") {
        const res = await api.login(username, password);
        setSession(res.token, username);
        onSuccess();
      } else {
        await api.register(username, password);
        const res = await api.login(username, password);
        setSession(res.token, username);
        onSuccess();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-12 max-w-md">
      <Card title={mode === "login" ? "Sign in" : "Register"}>
        <form onSubmit={submit} className="space-y-4">
          <ErrorBox message={error} />
          <TextInput
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
          <TextInput
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
          />
          <div className="flex items-center justify-between">
            <Button type="submit" disabled={busy}>
              {mode === "login" ? "Sign in" : "Register"}
            </Button>
            <button
              type="button"
              className="text-sm text-blue-600 hover:underline"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError(null);
              }}
            >
              {mode === "login"
                ? "Create an account"
                : "Already have an account?"}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
