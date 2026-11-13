import { useEffect, useState } from "react";
import { api, errorMessage, errorFields, setSession } from "./api";
import type { ApiErrors } from "./api";
import { Button, ErrorBanner, Field, FormErrors, inputClass, prevent } from "./ui";

export default function AuthPanel({
  mode,
  onSignedIn,
  onSwitch,
}: {
  mode: "login" | "register";
  onSignedIn: (username: string) => void;
  onSwitch: (mode: "login" | "register" | "browse") => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<ApiErrors>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setError("");
    setErrors({});
    setPassword("");
  }, [mode]);

  async function submit() {
    setBusy(true);
    setError("");
    setErrors({});
    setNotice("");
    try {
      if (mode === "register") {
        await api.register(username, password);
        setNotice("Account created. Signing you in…");
      }
      const token = await api.login(username, password);
      const normalized = username.trim();
      setSession(token, normalized);
      onSignedIn(normalized);
    } catch (err) {
      setError(errorMessage(err));
      setErrors(errorFields(err));
    } finally {
      setBusy(false);
    }
  }

  const isLogin = mode === "login";

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center">
      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Warehouse Inventory</h1>
        <p className="mt-1 text-sm text-slate-500">
          {isLogin
            ? "Sign in to manage items and record stock movements."
            : "Create an account to manage inventory."}
        </p>

        <form onSubmit={prevent(submit)} className="mt-6 space-y-4" noValidate>
          <Field label="Username" name="username" error={errors.username}>
            <input
              id="username"
              name="username"
              autoComplete="username"
              className={inputClass}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>
          <Field label="Password" name="password" error={errors.password}>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          <ErrorBanner message={error && Object.keys(errors).length === 0 ? error : ""} />
          <FormErrors errors={errors} exclude={["username", "password"]} />
          {notice && (
            <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              {notice}
            </div>
          )}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-600">
          {isLogin ? "Need an account?" : "Already have an account?"}{" "}
          <button
            type="button"
            className="font-medium text-indigo-600 hover:underline"
            onClick={() => onSwitch(isLogin ? "register" : "login")}
          >
            {isLogin ? "Register" : "Sign in"}
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <strong className="font-semibold text-slate-700">Just browsing?</strong>{" "}
        <button
          type="button"
          className="font-medium text-indigo-600 hover:underline"
          onClick={() => onSwitch("browse")}
        >
          View the inventory without signing in
        </button>
      </div>
    </div>
  );
}
