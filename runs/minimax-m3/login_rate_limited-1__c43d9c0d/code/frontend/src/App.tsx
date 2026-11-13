import { useEffect } from "react";
import { Layout } from "./components/Layout";
import { Card, PageTitle } from "./components/ui";
import { AuthProvider, useAuth } from "./lib/auth";
import { Link, Router, useRouter } from "./lib/router";
import AccountPage from "./pages/AccountPage";
import AdminPage from "./pages/AdminPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";

function Routes() {
  const { path, navigate } = useRouter();
  const { user, ready } = useAuth();

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      if (path === "/" || path === "/account" || path === "/admin") {
        navigate("/login", { replace: true });
      }
      return;
    }
    if (path === "/" || path === "/login" || path === "/register") {
      navigate("/account", { replace: true });
    }
  }, [ready, user, path, navigate]);

  if (!ready) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  switch (path) {
    case "/login":
      return <LoginPage />;
    case "/register":
      return <RegisterPage />;
    case "/account":
      return user ? <AccountPage /> : <LoginPage />;
    case "/admin":
      return user ? <AdminPage /> : <LoginPage />;
    default:
      return (
        <div className="mx-auto max-w-md">
          <Card>
            <PageTitle title="Page not found" subtitle="That address does not exist." />
            <Link to="/" className="font-semibold text-indigo-600 hover:text-indigo-500">
              Back to the app
            </Link>
          </Card>
        </div>
      );
  }
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <Layout>
          <Routes />
        </Layout>
      </AuthProvider>
    </Router>
  );
}
