import { AuthProvider, useAuth } from "./auth";
import AuthForm from "./pages/AuthForm";
import PostEditor from "./pages/PostEditor";
import PostList from "./pages/PostList";
import PostView from "./pages/PostView";
import { Link, navigate, useLocation } from "./router";
import { btnPrimary, btnSecondary } from "./ui";

function Header() {
  const { user, ready, logout } = useAuth();
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-4">
        <Link href="/" className="text-xl font-bold tracking-tight text-slate-900">
          Blog
        </Link>
        {ready && (
          <nav className="flex items-center gap-3 text-sm">
            {user ? (
              <>
                <Link href="/new" className={btnPrimary}>
                  New post
                </Link>
                <span className="text-slate-600">
                  Signed in as <strong className="text-slate-900">{user.username}</strong>
                  {user.is_admin && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">admin</span>}
                </span>
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={async () => {
                    await logout();
                    navigate("/");
                  }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className={btnSecondary}>
                  Sign in
                </Link>
                <Link href="/register" className={btnPrimary}>
                  Register
                </Link>
              </>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}

function Routes() {
  const { pathname, search } = useLocation();
  const next = new URLSearchParams(search).get("next") ?? "/";
  let m: RegExpMatchArray | null;
  if (pathname === "/") return <PostList search={search} />;
  if (pathname === "/login") return <AuthForm key="login" mode="login" next={next} />;
  if (pathname === "/register") return <AuthForm key="register" mode="register" next={next} />;
  if (pathname === "/new") return <PostEditor key="new" />;
  if ((m = pathname.match(/^\/posts\/(\d+)\/edit\/?$/))) return <PostEditor key={`edit-${m[1]}`} id={Number(m[1])} />;
  if ((m = pathname.match(/^\/posts\/(\d+)\/?$/))) return <PostView id={Number(m[1])} />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Link href="/" className="text-indigo-600 hover:underline">
        ← Back to posts
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <Header />
        <main className="mx-auto max-w-3xl px-4 py-8">
          <Routes />
        </main>
      </div>
    </AuthProvider>
  );
}
