import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { Button } from "../components";

export default function HomePage() {
  const { account } = useAuth();

  return (
    <div className="mx-auto max-w-2xl text-center">
      <span className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
        Flask + React + SQLite
      </span>
      <h1 className="mt-6 text-4xl font-bold tracking-tight text-slate-900">
        {account
          ? `Welcome back, ${account.username}.`
          : "Your account, all in one place."}
      </h1>
      <p className="mt-4 text-base leading-relaxed text-slate-600">
        Register, sign in, update your email, change your password, or recover a
        forgotten one. Reset links are delivered to the built-in outbox instead
        of a real mail server.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {account ? (
          <Link to="/account">
            <Button>Go to your account</Button>
          </Link>
        ) : (
          <Link to="/auth">
            <Button>Get started</Button>
          </Link>
        )}
        <Link to="/mailbox">
          <Button variant="secondary">Open mailbox</Button>
        </Link>
      </div>

      <div className="mt-12 grid gap-4 text-left sm:grid-cols-3">
        {[
          ["Accounts", "Unique usernames, case-insensitive unique emails."],
          ["Password reset", "Single-use links stored in the outbox."],
          ["Self-service", "Edit your email and change your password."],
        ].map(([title, text]) => (
          <div
            key={title}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            <p className="mt-2 text-sm text-slate-500">{text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
