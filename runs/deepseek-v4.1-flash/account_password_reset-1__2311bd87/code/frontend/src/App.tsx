import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError, getToken, setToken, type Account } from "./api";
import {
  AuthContext,
  RouterContext,
  useAuth,
  useRouter,
  type Auth,
  type Router,
} from "./context";
import HomePage from "./pages/HomePage";
import AccountPage from "./pages/AccountPage";
import ResetPage from "./pages/ResetPage";
import MailboxPage from "./pages/MailboxPage";

function Header() {
  const { account, signOut } = useAuth();
  const { path, navigate } = useRouter();

  const link = (to: string, label: string) => {
    const active = path === to;
    return (
      <button
        type="button"
        onClick={() => navigate(to)}
        className={
          "rounded-md px-3 py-1.5 text-sm font-medium transition " +
          (active
            ? "bg-indigo-100 text-indigo-700"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900")
        }
      >
        {label}
      </button>
    );
  };

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-lg font-semibold text-slate-900"
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
            A
          </span>
          Account Service
        </button>
        <nav className="flex flex-wrap items-center gap-1">
          {link("/mailbox", "Mailbox")}
          {account && link("/account", "Account")}
          {account ? (
            <div className="ml-3 flex items-center gap-3 border-l border-slate-200 pl-3">
              <span className="text-sm text-slate-600">
                Signed in as{" "}
                <span className="font-semibold text-slate-900">
                  {account.username}
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  signOut();
                  navigate("/");
                }}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => navigate("/")}
              className="ml-3 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Sign in
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}

function App() {
  const [path, setPath] = useState(() => window.location.pathname);
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);

  const navigate = useCallback((to: string) => {
    const url = new URL(to, window.location.href);
    window.history.pushState({}, "", url.pathname + url.search);
    setPath(url.pathname);
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const loadAccount = useCallback(async () => {
    if (!getToken()) {
      setAccount(null);
      setLoading(false);
      return;
    }
    try {
      setAccount(await api<Account>("/api/me"));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setToken(null);
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  const auth = useMemo<Auth>(
    () => ({
      account,
      loading,
      signIn: (token, nextAccount) => {
        setToken(token);
        setAccount(nextAccount);
      },
      signOut: () => {
        const token = getToken();
        setToken(null);
        setAccount(null);
        if (token) {
          void fetch("/api/auth/logout", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => {});
        }
      },
      refresh: loadAccount,
    }),
    [account, loading, loadAccount],
  );

  const router = useMemo<Router>(() => ({ path, navigate }), [path, navigate]);

  let page: ReactNode;
  if (path === "/account") page = <AccountPage />;
  else if (path === "/reset") page = <ResetPage />;
  else if (path === "/mailbox") page = <MailboxPage />;
  else page = <HomePage />;

  return (
    <RouterContext.Provider value={router}>
      <AuthContext.Provider value={auth}>
        <div className="min-h-screen bg-slate-50 text-slate-900">
          <Header />
          <main className="mx-auto max-w-4xl px-4 py-10">{page}</main>
          <footer className="mx-auto max-w-4xl px-4 pb-8 text-center text-xs text-slate-400">
            Account Service · outbox instead of a real mail server
          </footer>
        </div>
      </AuthContext.Provider>
    </RouterContext.Provider>
  );
}

export default App;
