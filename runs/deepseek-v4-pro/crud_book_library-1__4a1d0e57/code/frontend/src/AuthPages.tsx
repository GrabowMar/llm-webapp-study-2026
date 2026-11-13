import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, apiLogin, apiRegister } from "./api";
import { useAuth } from "./AuthContext";
import AuthForm from "./AuthForm";

export function LoginPage() {
  const { signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(username: string, password: string) {
    setError(null);
    try {
      const { token } = await apiLogin(username, password);
      signIn(username, token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  return (
    <div>
      <AuthForm title="Sign in" submitLabel="Sign in" onSubmit={handleLogin} />
      <p className="mt-4 text-center text-sm text-slate-600">
        No account?{" "}
        <Link to="/register" className="text-indigo-600 hover:underline">
          Register
        </Link>
      </p>
    </div>
  );
}

export function RegisterPage() {
  const { signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);

  async function handleRegister(username: string, password: string) {
    setError(null);
    try {
      await apiRegister(username, password);
      const { token } = await apiLogin(username, password);
      signIn(username, token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  return (
    <div>
      <AuthForm title="Create an account" submitLabel="Register" onSubmit={handleRegister} />
      <p className="mt-4 text-center text-sm text-slate-600">
        Already have an account?{" "}
        <Link to="/login" className="text-indigo-600 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
