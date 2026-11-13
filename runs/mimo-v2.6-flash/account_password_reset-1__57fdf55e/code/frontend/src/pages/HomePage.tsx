import type { Account } from "../api";
import { Link } from "../router";
import {
  buttonClass,
  cardClass,
  secondaryButtonClass,
} from "../ui";

export default function HomePage({ account }: { account: Account | null }) {
  return (
    <div className="max-w-2xl">
      <h1 className="mb-3 text-3xl font-bold tracking-tight text-slate-900">
        Welcome
      </h1>
      <p className="mb-8 text-slate-600">
        Create an account, sign in, and reset a forgotten password. Every
        outgoing message lands in the Mailbox instead of a real mail server.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={cardClass}>
          <h2 className="mb-2 text-lg font-semibold text-slate-900">
            {account ? "Your account" : "Sign in"}
          </h2>
          <p className="mb-4 text-sm text-slate-600">
            {account
              ? `You are signed in as ${account.username}.`
              : "Use your username and password to sign in."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              to={account ? "/account" : "/login"}
              className={buttonClass}
            >
              {account ? "Open account" : "Sign in"}
            </Link>
            {!account && (
              <Link to="/register" className={secondaryButtonClass}>
                Register
              </Link>
            )}
          </div>
        </div>
        <div className={cardClass}>
          <h2 className="mb-2 text-lg font-semibold text-slate-900">
            Forgot password?
          </h2>
          <p className="mb-4 text-sm text-slate-600">
            Request a reset link and read it from the Mailbox page.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to="/forgot" className={buttonClass}>
              Reset password
            </Link>
            <Link to="/mailbox" className={secondaryButtonClass}>
              Open Mailbox
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
