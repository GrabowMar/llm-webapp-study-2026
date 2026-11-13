import { useState } from "react";
import { api, ApiError, setToken } from "./api";
import { Banner, FieldError, inputClass, labelClass, Modal, primaryBtn } from "./ui";

export function AuthPanel({
  mode,
  onAuthenticated,
  onSwitchMode,
  onClose,
}: {
  mode: "login" | "register";
  onAuthenticated: (username: string) => void;
  onSwitchMode: (mode: "login" | "register") => void;
  onClose: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setGeneral("");
    try {
      if (mode === "register") await api.register(username, password);
      const { token } = await api.login(username, password);
      setToken(token);
      onAuthenticated(username.trim());
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.errors);
        setGeneral(error.message);
      } else {
        setGeneral("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  function switchTo(next: "login" | "register") {
    setErrors({});
    setGeneral("");
    setPassword("");
    onSwitchMode(next);
  }

  return (
    <Modal title={mode === "login" ? "Sign in" : "Create an account"} onClose={onClose}>
      <p className="mb-5 text-sm text-stone-500">
        {mode === "login"
          ? "Sign in to add and manage your recipes."
          : "Join to share your own recipes with everyone."}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {general && <Banner>{general}</Banner>}
        <div>
          <label className={labelClass} htmlFor="auth-username">
            Username
          </label>
          <input
            id="auth-username"
            className={inputClass}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            placeholder="e.g. chef"
          />
          <FieldError message={errors.username} />
        </div>
        <div>
          <label className={labelClass} htmlFor="auth-password">
            Password
          </label>
          <input
            id="auth-password"
            type="password"
            className={inputClass}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder="At least 6 characters"
          />
          <FieldError message={errors.password} />
        </div>
        <button type="submit" className={`${primaryBtn} w-full`} disabled={busy}>
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-stone-500">
        {mode === "login" ? "New here?" : "Already have an account?"}{" "}
        <button
          type="button"
          onClick={() => switchTo(mode === "login" ? "register" : "login")}
          className="font-semibold text-amber-700 underline-offset-2 hover:underline"
        >
          {mode === "login" ? "Create an account" : "Sign in"}
        </button>
      </p>
    </Modal>
  );
}
