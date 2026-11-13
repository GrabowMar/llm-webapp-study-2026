import AuthPage from "./AuthPage";
import { AuthProvider, useAuth } from "./auth";
import Dashboard from "./Dashboard";
import { Link, navigate, usePath } from "./router";
import SensorPage from "./SensorPage";
import { Button } from "./ui";

function Header() {
  const { username, logout } = useAuth();
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/" className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <span className="inline-block h-3 w-3 rounded-full bg-emerald-500" />
          Sensor Dashboard
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          {username ? (
            <>
              <span className="text-slate-600">
                Signed in as <span className="font-semibold text-slate-900">{username}</span>
              </span>
              <Button
                variant="secondary"
                onClick={async () => {
                  await logout();
                  navigate("/");
                }}
              >
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Link to="/login" className="font-medium text-slate-700 hover:text-indigo-600">
                Sign in
              </Link>
              <Link
                to="/register"
                className="rounded-md bg-indigo-600 px-3 py-2 font-semibold text-white shadow-sm hover:bg-indigo-500"
              >
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function Routes() {
  const path = usePath();
  const sensorMatch = path.match(/^\/sensors\/(\d+)\/?$/);
  if (path === "/login") return <AuthPage mode="login" />;
  if (path === "/register") return <AuthPage mode="register" />;
  if (sensorMatch) return <SensorPage key={sensorMatch[1]} id={Number(sensorMatch[1])} />;
  return <Dashboard />;
}

export default function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <Header />
        <main className="mx-auto max-w-6xl px-4 py-8">
          <Routes />
        </main>
      </div>
    </AuthProvider>
  );
}
