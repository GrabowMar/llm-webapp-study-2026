import { useCallback, useEffect, useState } from "react";
import { ApiError, clearSession, getUsername } from "./api";
import AuthPage from "./pages/AuthPage";
import BookFormPage from "./pages/BookFormPage";
import BookPage from "./pages/BookPage";
import BooksPage from "./pages/BooksPage";

type Route =
  | { name: "books" }
  | { name: "login" }
  | { name: "register" }
  | { name: "book-new" }
  | { name: "book"; id: number }
  | { name: "book-edit"; id: number }
  | { name: "not-found" };

function parsePath(pathname: string): Route {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return { name: "books" };
  if (parts[0] === "login" && parts.length === 1) return { name: "login" };
  if (parts[0] === "register" && parts.length === 1) return { name: "register" };
  if (parts[0] === "books") {
    if (parts.length === 1) return { name: "books" };
    if (parts[1] === "new" && parts.length === 2) return { name: "book-new" };
    const id = Number(parts[1]);
    if (Number.isInteger(id) && id > 0) {
      if (parts.length === 2) return { name: "book", id };
      if (parts[2] === "edit" && parts.length === 3) return { name: "book-edit", id };
    }
  }
  return { name: "not-found" };
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parsePath(window.location.pathname));
  const [username, setUsername] = useState<string | null>(() => getUsername());
  const [authError, setAuthError] = useState<string | null>(null);

  const navigate = useCallback((path: string) => {
    window.history.pushState({}, "", path);
    setRoute(parsePath(path));
    setAuthError(null);
  }, []);

  useEffect(() => {
    const onPop = () => setRoute(parsePath(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const signIn = useCallback(
    (token: string, name: string) => {
      localStorage.setItem("token", token);
      localStorage.setItem("username", name);
      setUsername(name);
      navigate("/");
    },
    [navigate],
  );

  const signOut = useCallback(() => {
    clearSession();
    setUsername(null);
    navigate("/");
  }, [navigate]);

  const onApiError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        setUsername(null);
        navigate("/login");
        setAuthError("Please sign in to continue.");
      }
    },
    [navigate],
  );

  const signInPrompt = (
    <AuthPage mode="login" onSignedIn={signIn} navigate={navigate} banner="Please sign in to continue." />
  );

  let content: React.ReactNode;
  switch (route.name) {
    case "books":
      content = <BooksPage username={username} navigate={navigate} />;
      break;
    case "login":
      content = (
        <AuthPage
          mode="login"
          onSignedIn={signIn}
          navigate={navigate}
          banner={authError}
        />
      );
      break;
    case "register":
      content = (
        <AuthPage mode="register" onSignedIn={signIn} navigate={navigate} />
      );
      break;
    case "book-new":
      content = username ? (
        <BookFormPage mode="add" navigate={navigate} onApiError={onApiError} />
      ) : (
        signInPrompt
      );
      break;
    case "book":
      content = (
        <BookPage
          id={route.id}
          username={username}
          navigate={navigate}
          onApiError={onApiError}
        />
      );
      break;
    case "book-edit":
      content = username ? (
        <BookFormPage
          mode="edit"
          bookId={route.id}
          navigate={navigate}
          onApiError={onApiError}
        />
      ) : (
        signInPrompt
      );
      break;
    default:
      content = (
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <p className="text-lg text-gray-600">Page not found.</p>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="mt-4 text-indigo-600 hover:underline"
          >
            Back to books
          </button>
        </div>
      );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="text-lg font-semibold tracking-tight text-indigo-700 hover:text-indigo-900"
          >
            Book Library
          </button>
          <nav className="flex items-center gap-3 text-sm">
            {username ? (
              <>
                <span className="text-gray-600">
                  Signed in as <span className="font-medium text-gray-900">{username}</span>
                </span>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded border border-gray-300 px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-100"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => navigate("/login")}
                  className="rounded border border-gray-300 px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-100"
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/register")}
                  className="rounded bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-700"
                >
                  Register
                </button>
              </>
            )}
          </nav>
        </div>
      </header>
      <main>{content}</main>
    </div>
  );
}
