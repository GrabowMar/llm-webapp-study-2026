import { Link, Route, Routes } from "react-router-dom";
import { useAuth } from "./AuthContext";
import BookDetailPage from "./BookDetailPage";
import BookForm from "./BookForm";
import BookListPage from "./BookListPage";
import { LoginPage, RegisterPage } from "./AuthPages";

export default function App() {
  const { auth, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-lg font-semibold text-slate-900">
            Book Library
          </Link>
          <div className="flex items-center gap-4">
            {auth.username ? (
              <>
                <span className="text-sm text-slate-700">
                  Signed in as <span className="font-medium">{auth.username}</span>
                </span>
                <button
                  onClick={signOut}
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="text-sm text-slate-700 hover:underline">
                  Sign in
                </Link>
                <Link
                  to="/register"
                  className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<BookListPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/books/new" element={<BookForm />} />
          <Route path="/books/:id" element={<BookDetailPage />} />
          <Route path="/books/:id/edit" element={<BookForm editing />} />
        </Routes>
      </main>
    </div>
  );
}
