import { useAuth } from "./auth";
import { Link, navigate, useHashRoute } from "./router";
import PublicPage from "./pages/PublicPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import IncidentListPage from "./pages/IncidentListPage";
import IncidentDetailPage from "./pages/IncidentDetailPage";
import NewIncidentPage from "./pages/NewIncidentPage";
import { buttonGhost } from "./ui";

export default function App() {
  const path = useHashRoute();
  const segments = path.split("/").filter(Boolean);

  let page: React.ReactNode;
  if (segments.length === 0) {
    page = <PublicPage />;
  } else if (segments[0] === "login") {
    page = <LoginPage />;
  } else if (segments[0] === "register") {
    page = <RegisterPage />;
  } else if (segments[0] === "incidents" && segments.length === 1) {
    page = <RequireAuth><IncidentListPage /></RequireAuth>;
  } else if (segments[0] === "incidents" && segments[1] === "new") {
    page = <RequireAuth><NewIncidentPage /></RequireAuth>;
  } else if (segments[0] === "incidents" && segments[1]) {
    const id = Number(segments[1]);
    page = (
      <RequireAuth>
        {Number.isFinite(id) ? (
          <IncidentDetailPage id={id} />
        ) : (
          <p className="mx-auto max-w-5xl px-4 py-10 text-slate-400">Unknown incident.</p>
        )}
      </RequireAuth>
    );
  } else {
    page = (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-100">Page not found</h1>
        <Link to="/" className="mt-4 inline-block text-cyan-400 underline underline-offset-2">
          Back to the public status page
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Header />
      <main>{page}</main>
      <footer className="border-t border-slate-900 px-4 py-6 text-center text-xs text-slate-600">
        Incident center · operations team
      </footer>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  if (!token) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-20">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-center">
          <h1 className="text-xl font-bold text-slate-50">Sign in required</h1>
          <p className="mt-2 text-sm text-slate-400">
            Incidents are managed by signed-in team members.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <button
              type="button"
              className={buttonGhost}
              onClick={() => navigate("/login")}
            >
              Sign in
            </button>
            <button
              type="button"
              className={buttonGhost}
              onClick={() => navigate("/register")}
            >
              Create an account
            </button>
          </div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

function Header() {
  const { username, signOut } = useAuth();

  return (
    <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-4 px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/15 text-sm font-bold text-cyan-300 ring-1 ring-cyan-400/40">
            IC
          </span>
          <span className="text-sm font-semibold tracking-wide text-slate-100">
            Incident center
          </span>
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          <Link
            to="/"
            className="rounded-lg px-3 py-1.5 text-slate-300 transition hover:bg-slate-900 hover:text-slate-100"
          >
            Public status
          </Link>
          <Link
            to="/incidents"
            className="rounded-lg px-3 py-1.5 text-slate-300 transition hover:bg-slate-900 hover:text-slate-100"
          >
            Incidents
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {username ? (
            <>
              <span className="hidden text-sm text-slate-400 sm:inline">
                Signed in as{" "}
                <span className="font-medium text-slate-200">{username}</span>
              </span>
              <button
                type="button"
                className={buttonGhost}
                onClick={() => {
                  signOut();
                  navigate("/");
                }}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className={buttonGhost}>
                Sign in
              </Link>
              <Link
                to="/register"
                className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
              >
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
