import { useState, type FormEvent } from "react";
import { ApiError, apiRequest, type FieldErrors } from "../api";
import { useAuth } from "../auth";
import { navigate } from "../router";
import FieldErrorMessages from "../components/FieldErrors";

type Props = {
  mode: "login" | "register";
  redirectTo?: string;
};

export default function AuthPage({ mode, redirectTo }: Props) {
  const { signIn, username } = useAuth();
  const isRegister = mode === "register";

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setFieldErrors({});
    setFormError("");

    try {
      if (isRegister) {
        await apiRequest("/api/auth/register", {
          method: "POST",
          body: { username: name, password },
        });
      }
      const result = await apiRequest<{ token: string }>("/api/auth/login", {
        method: "POST",
        body: { username: name, password },
      });
      signIn(result.token, name.trim());
      navigate(redirectTo ?? "/");
    } catch (err) {
      const apiError =
        err instanceof ApiError
          ? err
          : new ApiError(
              0,
              err instanceof Error ? err.message : "Something went wrong.",
            );
      setFieldErrors(apiError.errors);
      setFormError(apiError.message);
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500";

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold text-slate-900">
        {isRegister ? "Create an account" : "Sign in"}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        {isRegister
          ? "Register to add and manage your own recipes."
          : "Sign in to add recipes or edit your own."}
      </p>

      {username && !isRegister && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You are signed in as <span className="font-semibold">{username}</span>.
        </div>
      )}

      {formError && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {formError}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div>
          <label
            htmlFor="auth-username"
            className="block text-sm font-medium text-slate-700"
          >
            Username
          </label>
          <input
            id="auth-username"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="username"
            placeholder="e.g. alice"
            className={inputClass}
          />
          <FieldErrorMessages messages={fieldErrors.username} />
        </div>

        <div>
          <label
            htmlFor="auth-password"
            className="block text-sm font-medium text-slate-700"
          >
            Password
          </label>
          <input
            id="auth-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={
              isRegister ? "new-password" : "current-password"
            }
            placeholder="Your password"
            className={inputClass}
          />
          <FieldErrorMessages messages={fieldErrors.password} />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy
            ? "Please wait..."
            : isRegister
              ? "Register"
              : "Sign in"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-slate-600">
        {isRegister ? (
          <>
            Already have an account?{" "}
            <a href="#/login" className="font-medium text-amber-700 hover:underline">
              Sign in
            </a>
          </>
        ) : (
          <>
            Need an account?{" "}
            <a
              href="#/register"
              className="font-medium text-amber-700 hover:underline"
            >
              Register
            </a>
          </>
        )}
      </p>
    </div>
  );
}
