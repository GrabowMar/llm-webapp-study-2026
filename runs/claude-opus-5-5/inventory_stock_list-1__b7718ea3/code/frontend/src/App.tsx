import { useAuth } from "./auth";
import { Link, useLocation } from "./router";
import { AuthPage } from "./pages/AuthPage";
import { InventoryPage } from "./pages/InventoryPage";
import { ItemPage } from "./pages/ItemPage";
import { ItemFormPage } from "./pages/ItemFormPage";
import { Button } from "./components/ui";

function Header() {
  const { username, logout } = useAuth();
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-indigo-600 text-sm text-white">IN</span>
          Inventory
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          {username ? (
            <>
              <span className="text-slate-600">
                Signed in as <strong className="font-semibold text-slate-900" data-testid="current-user">{username}</strong>
              </span>
              <Button variant="secondary" onClick={() => void logout()}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Link href="/login" className="font-medium text-slate-700 hover:text-indigo-600">
                Sign in
              </Link>
              <Link href="/register" className="rounded-md bg-indigo-600 px-3 py-2 font-semibold text-white hover:bg-indigo-500">
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold text-slate-900">Page not found</h1>
      <Link href="/" className="mt-4 inline-block text-indigo-600 hover:underline">
        Back to inventory
      </Link>
    </div>
  );
}

function Routes() {
  const { pathname, search } = useLocation();
  if (pathname === "/" || pathname === "/items") return <InventoryPage search={search} />;
  if (pathname === "/login") return <AuthPage mode="login" />;
  if (pathname === "/register") return <AuthPage mode="register" />;
  if (pathname === "/items/new") return <ItemFormPage key="new" />;
  let m = pathname.match(/^\/items\/(\d+)\/edit\/?$/);
  if (m) return <ItemFormPage key={`edit-${m[1]}`} itemId={Number(m[1])} />;
  m = pathname.match(/^\/items\/(\d+)\/?$/);
  if (m) return <ItemPage key={m[1]} itemId={Number(m[1])} />;
  return <NotFound />;
}

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Routes />
      </main>
    </div>
  );
}
