import { Link, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { useAuth } from "./auth";
import Account from "./pages/Account";
import ForgotPassword from "./pages/ForgotPassword";
import Home from "./pages/Home";
import Mailbox from "./pages/Mailbox";
import ResetPassword from "./pages/ResetPassword";
import { Button, Card } from "./ui";

const links = [
  { to: "/", label: "Home", end: true },
  { to: "/account", label: "Account", end: false },
  { to: "/mailbox", label: "Mailbox", end: false },
];

function navLinkClass(isActive: boolean): string {
  return [
    "rounded-lg px-3 py-1.5 text-sm font-medium transition",
    isActive
      ? "bg-indigo-50 text-indigo-700"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  ].join(" ");
}

function NotFound() {
  return (
    <Card title="Page not found">
      <p className="text-sm text-slate-600">
        That page does not exist.{" "}
        <Link
          to="/"
          className="font-medium text-indigo-600 underline-offset-2 hover:underline"
        >
          Go home
        </Link>
      </p>
    </Card>
  );
}

export default function App() {
  const { account, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <Link to="/" className="text-lg font-semibold tracking-tight text-slate-900">
            Password reset
          </Link>
          <nav className="flex items-center gap-1">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) => navLinkClass(isActive)}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            {account ? (
              <>
                <span className="text-sm text-slate-600">{account.username}</span>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    await signOut();
                    navigate("/");
                  }}
                >
                  Sign out
                </Button>
              </>
            ) : (
              <span className="text-sm text-slate-500">Not signed in</span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset" element={<ResetPassword />} />
          <Route path="/account" element={<Account />} />
          <Route path="/mailbox" element={<Mailbox />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-6 text-xs text-slate-400">
          Outgoing mail is not delivered. Messages are kept in an outbox that you
          can read in the Mailbox page.
        </div>
      </footer>
    </div>
  );
}
