import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { errorMessage } from "../api";
import { useAuth } from "../auth";
import { cardClass } from "../ui";
import { ErrorAlert } from "../ui";
import { inputClass } from "../ui";
import { labelClass } from "../ui";
import { primaryButtonClass } from "../ui";

export default function AuthPage() {
  const { username, signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const [signInUser, setSignInUser] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [signInError, setSignInError] = useState<string | null>(null);
  const [signInBusy, setSignInBusy] = useState(false);

  const [registerUser, setRegisterUser] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerBusy, setRegisterBusy] = useState(false);

  async function handleSignIn(event: FormEvent) {
    event.preventDefault();
    setSignInBusy(true);
    setSignInError(null);
    try {
      await signIn(signInUser, signInPassword);
      navigate("/");
    } catch (err) {
      setSignInError(errorMessage(err));
    } finally {
      setSignInBusy(false);
    }
  }

  async function handleRegister(event: FormEvent) {
    event.preventDefault();
    setRegisterBusy(true);
    setRegisterError(null);
    try {
      await signUp(registerUser, registerPassword);
      navigate("/");
    } catch (err) {
      setRegisterError(errorMessage(err));
    } finally {
      setRegisterBusy(false);
    }
  }

  if (username) {
    return (
      <div className={`${cardClass} mx-auto max-w-md text-center`}>
        <h1 className="mb-2 text-xl font-semibold">You are signed in</h1>
        <p className="mb-4 text-slate-600">
          Signed in as <span className="font-semibold text-slate-900">{username}</span>.
        </p>
        <Link to="/" className={primaryButtonClass}>
          Go to inventory
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-6 md:grid-cols-2">
      <section className={cardClass}>
        <h1 className="mb-1 text-xl font-semibold">Sign in</h1>
        <p className="mb-4 text-sm text-slate-500">Sign in to manage items and record stock movements.</p>
        <form onSubmit={handleSignIn} className="space-y-4">
          <div>
            <label htmlFor="signin-username" className={labelClass}>
              Username
            </label>
            <input
              id="signin-username"
              className={inputClass}
              value={signInUser}
              onChange={(e) => setSignInUser(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div>
            <label htmlFor="signin-password" className={labelClass}>
              Password
            </label>
            <input
              id="signin-password"
              type="password"
              className={inputClass}
              value={signInPassword}
              onChange={(e) => setSignInPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <ErrorAlert message={signInError} />
          <button type="submit" className={`${primaryButtonClass} w-full`} disabled={signInBusy}>
            {signInBusy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>

      <section className={cardClass}>
        <h2 className="mb-1 text-xl font-semibold">Create an account</h2>
        <p className="mb-4 text-sm text-slate-500">Register to start managing warehouse stock.</p>
        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label htmlFor="register-username" className={labelClass}>
              Username
            </label>
            <input
              id="register-username"
              className={inputClass}
              value={registerUser}
              onChange={(e) => setRegisterUser(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div>
            <label htmlFor="register-password" className={labelClass}>
              Password
            </label>
            <input
              id="register-password"
              type="password"
              className={inputClass}
              value={registerPassword}
              onChange={(e) => setRegisterPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <ErrorAlert message={registerError} />
          <button type="submit" className={`${primaryButtonClass} w-full`} disabled={registerBusy}>
            {registerBusy ? "Creating account…" : "Register"}
          </button>
        </form>
      </section>
    </div>
  );
}
