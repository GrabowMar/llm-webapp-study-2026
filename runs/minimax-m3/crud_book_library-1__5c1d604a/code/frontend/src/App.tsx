import { AuthProvider, useAuth } from "./auth";
import Header from "./components/Header";
import BooksPage from "./pages/BooksPage";
import BookPage from "./pages/BookPage";
import BookFormPage from "./pages/BookFormPage";
import { Link, usePath } from "./router";

function NotFound() {
  return (
    <div className="space-y-4 py-10 text-center">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Page not found</h1>
      <p className="text-sm text-slate-500">The page you were looking for does not exist.</p>
      <Link to="/" className="text-sm font-semibold text-indigo-700 hover:text-indigo-900">
        ← Back to books
      </Link>
    </div>
  );
}

function Routes() {
  const path = usePath();
  const { user, ready } = useAuth();

  if (path === "/" || path === "/books") return <BooksPage />;
  if (path === "/books/new") {
    if (!ready) return null;
    return user ? <BookFormPage /> : <SignInPrompt />;
  }

  const detail = /^\/books\/(\d+)$/.exec(path);
  if (detail) return <BookPage bookId={Number(detail[1])} />;

  const edit = /^\/books\/(\d+)\/edit$/.exec(path);
  if (edit) {
    if (!ready) return null;
    return user ? <BookFormPage bookId={Number(edit[1])} /> : <SignInPrompt />;
  }

  return <NotFound />;
}

function SignInPrompt() {
  return (
    <div className="mx-auto max-w-xl space-y-3 py-16 text-center">
      <h1 className="text-xl font-bold tracking-tight text-slate-900">Sign in to continue</h1>
      <p className="text-sm text-slate-500">
        You need to be signed in to add or edit books.
      </p>
      <Link to="/" className="text-sm font-semibold text-indigo-700 hover:text-indigo-900">
        ← Back to books
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <Header />
        <main className="mx-auto max-w-5xl px-4 py-8">
          <Routes />
        </main>
        <footer className="mx-auto max-w-5xl px-4 pb-10 text-center text-xs text-slate-400">
          Book Library — a shared catalogue with reader reviews.
        </footer>
      </div>
    </AuthProvider>
  );
}
