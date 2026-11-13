import { AuthProvider, useAuth } from "./auth";
import { matchRoute, navigate, useRoute } from "./router";
import LoginScreen from "./screens/LoginScreen";
import CustomerListScreen from "./screens/CustomerListScreen";
import CustomerDetailScreen from "./screens/CustomerDetailScreen";
import { useEffect } from "react";

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}

function Shell() {
  const auth = useAuth();
  const route = useRoute();

  useEffect(() => {
    if (auth.username && (route === "/" || route === "")) navigate("/customers");
    if (!auth.username && route.startsWith("/customers")) navigate("/login");
  }, [auth.username, route]);

  if (!auth.username) return <LoginScreen />;

  const detail = matchRoute("/customers/:id", route);
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <button
            onClick={() => navigate("/customers")}
            className="text-lg font-bold text-slate-900"
          >
            Customer Directory
          </button>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-slate-600">
              Signed in as <span className="font-medium text-slate-900">{auth.username}</span>
            </span>
            <button
              onClick={() => {
                auth.signOut();
                navigate("/login");
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {detail ? (
          <CustomerDetailScreen id={Number(detail.id)} />
        ) : (
          <CustomerListScreen />
        )}
      </main>
    </div>
  );
}
