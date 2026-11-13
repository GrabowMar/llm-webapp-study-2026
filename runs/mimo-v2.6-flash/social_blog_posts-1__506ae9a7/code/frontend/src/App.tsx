import { ReactNode, useEffect, useState } from "react";
import { clearSession, loadSession } from "./api";
import AuthForm from "./components/AuthForm";
import Editor from "./components/Editor";
import Header from "./components/Header";
import PostList, { ListFilters } from "./components/PostList";
import PostPage from "./components/PostPage";
import { Route, navigate, parseRoute } from "./router";

const EMPTY_FILTERS: ListFilters = { q: "", tag: "", author: "", page: 1 };

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  const [username, setUsername] = useState<string | null>(
    () => loadSession()?.username ?? null,
  );
  const [filters, setFilters] = useState<ListFilters>(EMPTY_FILTERS);

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function handleSignOut() {
    clearSession();
    setUsername(null);
    setFilters(EMPTY_FILTERS);
    navigate("/");
  }

  function handleSignedIn(name: string) {
    setUsername(name);
  }

  function handleTagClick(tag: string) {
    setFilters({ ...EMPTY_FILTERS, tag });
    navigate("/");
  }

  const needsAuth = route.name === "write" || route.name === "edit";

  let page: ReactNode;
  if (needsAuth && !username) {
    page = (
      <AuthForm
        mode="login"
        note="Sign in to publish and edit posts."
        redirectTo={route.name === "write" ? "/write" : `/edit/${route.id}`}
        onSignedIn={handleSignedIn}
      />
    );
  } else {
    switch (route.name) {
      case "post":
        page = (
          <PostPage id={route.id} username={username} onTagClick={handleTagClick} />
        );
        break;
      case "write":
        page = <Editor id={null} />;
        break;
      case "edit":
        page = <Editor id={route.id} />;
        break;
      case "login":
        page = <AuthForm mode="login" onSignedIn={handleSignedIn} />;
        break;
      case "register":
        page = <AuthForm mode="register" onSignedIn={handleSignedIn} />;
        break;
      default:
        page = (
          <PostList filters={filters} onFiltersChange={setFilters} username={username} />
        );
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 text-gray-900">
      <Header username={username} onSignOut={handleSignOut} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">{page}</main>
      <footer className="border-t border-gray-200 bg-white py-4 text-center text-xs text-gray-500">
        Multi-author blog
      </footer>
    </div>
  );
}
