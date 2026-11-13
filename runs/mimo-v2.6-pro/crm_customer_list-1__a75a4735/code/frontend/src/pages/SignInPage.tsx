import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { ApiError } from "../api";
import { useAuth } from "../auth";
import { Alert, Button, Card, Field, TextInput } from "../ui";

export default function SignInPage() {
  const { token, signIn, signUp } = useAuth();
  const [signInName, setSignInName] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [signInError, setSignInError] = useState<ApiError | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const [registerName, setRegisterName] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerError, setRegisterError] = useState<ApiError | null>(null);
  const [registering, setRegistering] = useState(false);

  if (token) return <Navigate to="/customers" replace />;

  async function handleSignIn(event: FormEvent) {
    event.preventDefault();
    setSignInError(null);
    setSigningIn(true);
    try {
      await signIn(signInName, signInPassword);
    } catch (err) {
      setSignInError(err instanceof ApiError ? err : new ApiError(0, "Sign in failed"));
    } finally {
      setSigningIn(false);
    }
  }

  async function handleRegister(event: FormEvent) {
    event.preventDefault();
    setRegisterError(null);
    setRegistering(true);
    try {
      await signUp(registerName, registerPassword);
    } catch (err) {
      setRegisterError(err instanceof ApiError ? err : new ApiError(0, "Registration failed"));
    } finally {
      setRegistering(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 lg:grid-cols-2 lg:py-20">
        <div className="flex flex-col justify-center">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white">
              CD
            </span>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Customer Directory</h1>
          </div>
          <p className="max-w-xl text-lg text-slate-600">
            A shared, private directory of your team's customers. Keep every contact detail in one
            place and log each call, email and meeting so the whole team knows who spoke to whom and
            when.
          </p>
          <ul className="mt-8 space-y-3 text-slate-700">
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-sm text-indigo-700">
                1
              </span>
              <span>Search and filter customers by name, email, phone or company.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-sm text-indigo-700">
                2
              </span>
              <span>See every interaction on a customer's page, newest first.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-sm text-indigo-700">
                3
              </span>
              <span>Private to signed-in team members — everyone can read and update.</span>
            </li>
          </ul>
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="text-xl font-semibold text-slate-900">Sign in</h2>
            <p className="mt-1 text-sm text-slate-600">Welcome back. Sign in to open the directory.</p>
            <form onSubmit={handleSignIn} className="mt-5 space-y-4">
              {signInError ? <Alert>{signInError.message}</Alert> : null}
              <Field label="Username" error={signInError?.fields.username}>
                <TextInput
                  value={signInName}
                  onChange={(e) => setSignInName(e.target.value)}
                  autoComplete="username"
                  required
                />
              </Field>
              <Field label="Password" error={signInError?.fields.password}>
                <TextInput
                  type="password"
                  value={signInPassword}
                  onChange={(e) => setSignInPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </Field>
              <Button type="submit" disabled={signingIn} className="w-full">
                {signingIn ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </Card>

          <Card>
            <h2 className="text-xl font-semibold text-slate-900">Create an account</h2>
            <p className="mt-1 text-sm text-slate-600">
              New to the directory? Register with a username and password to join your team.
            </p>
            <form onSubmit={handleRegister} className="mt-5 space-y-4">
              {registerError ? <Alert>{registerError.message}</Alert> : null}
              <Field label="Username" error={registerError?.fields.username}>
                <TextInput
                  value={registerName}
                  onChange={(e) => setRegisterName(e.target.value)}
                  autoComplete="username"
                  required
                />
              </Field>
              <Field label="Password" error={registerError?.fields.password}>
                <TextInput
                  type="password"
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </Field>
              <Button type="submit" variant="secondary" disabled={registering} className="w-full">
                {registering ? "Creating account…" : "Create account"}
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
