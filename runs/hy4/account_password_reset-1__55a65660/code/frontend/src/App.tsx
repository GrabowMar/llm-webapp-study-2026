import { Link, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { useAuth } from "./auth";
import { Button } from "./components";
import AccountPage from "./pages/AccountPage";
import AuthPage from "./pages/AuthPage";
import ForgotPage from "./pages/ForgotPage";
import HomePage from "./pages/HomePage";
import MailboxPage from "./pages/MailboxPage";
import ResetPage from "./pages/ResetPage";

function Header() {
  const { account, signOut } = useAuth();
  const navigate = useNavigate();

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition ${
      isActive
        ? "bg-indigo-50 text-indigo-700"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
    }`;

  return (
    <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
        <Link to="/" className="mr-2 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
            A
          </span>
          <span className="text-base font-bold tracking-tight text-slate-900">
            Account Service
          </span>
        </Link>

        <nav className="flex flex-1 flex-wrap items-center gap-1">
          <NavLink to="/" end className={navClass}>
            Home
          </NavLink>
          <NavLink to="/account" className={navClass}>
            Account
          </NavLink>
          <NavLink to="/mailbox" className={navClass}>
            Mailbox
          </NavLink>
        </nav>

        {account ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">
              Signed in as{" "}
              <span className="font-semibold text-slate-900">
                {account.username}
              </span>
            </span>
            <Button
              variant="secondary"
              onClick={async () => {
                await signOut();
                navigate("/");
              }}
            >
              Sign out
            </Button>
          </div>
        ) : (
          <Link to="/auth">
            <Button variant="secondary">Sign in</Button>
          </Link>
        )}
      </div>
    </header>
  );
}

export default function App() {
  const { loading } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-10">
        {loading ? (
          <p className="text-center text-sm text-slate-500">Loading…</p>
        ) : (
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/forgot-password" element={<ForgotPage />} />
            <Route path="/reset" element={<ResetPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/mailbox" element={<MailboxPage />} />
            <Route path="*" element={<HomePage />} />
          </Routes>
        )}
      </main>
      <footer className="mx-auto max-w-5xl px-4 pb-8 text-center text-xs text-slate-400">
        Outgoing mail is stored in the local outbox — no real email is sent.
      </footer>
    </div>
  );
}
