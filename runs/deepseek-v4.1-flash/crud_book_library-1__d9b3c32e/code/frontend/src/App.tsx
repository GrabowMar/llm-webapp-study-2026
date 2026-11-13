import { useEffect } from "react";
import { AuthProvider } from "./auth";
import { Layout } from "./components/Layout";
import { useLocation } from "./router";
import BooksPage from "./pages/BooksPage";
import BookPage from "./pages/BookPage";
import BookFormPage from "./pages/BookFormPage";
import AuthPage from "./pages/AuthPage";

function Router() {
  const location = useLocation();
  const path = location.split("?")[0];

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [path]);

  let element: React.ReactNode;
  let match: RegExpMatchArray | null;

  if (path === "/" || path === "") {
    element = <BooksPage />;
  } else if ((match = path.match(/^\/books\/new$/))) {
    element = <BookFormPage />;
  } else if ((match = path.match(/^\/books\/(\d+)\/edit$/))) {
    element = <BookFormPage id={Number(match[1])} />;
  } else if ((match = path.match(/^\/books\/(\d+)$/))) {
    element = <BookPage id={Number(match[1])} />;
  } else if (path === "/auth" || path === "/login") {
    element = <AuthPage initialMode="login" />;
  } else if (path === "/register") {
    element = <AuthPage initialMode="register" />;
  } else {
    element = (
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-bold">Page not found</h1>
        <a href="/" className="text-indigo-600 hover:underline">
          Back to books
        </a>
      </div>
    );
  }

  return <Layout>{element}</Layout>;
}

export default function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
