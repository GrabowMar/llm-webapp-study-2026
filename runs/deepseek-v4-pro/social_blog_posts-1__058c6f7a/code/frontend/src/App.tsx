import { AuthProvider, useAuth } from "./auth";
import Nav from "./components/Nav";
import AuthForms from "./pages/AuthForms";
import Editor from "./pages/Editor";
import PostList from "./pages/PostList";
import PostPage from "./pages/PostPage";
import { RouterProvider, useRoute } from "./router";

function Screen() {
  const route = useRoute();
  const { user, ready } = useAuth();

  if (!ready) {
    return <p className="px-4 py-8 text-sm text-slate-500">Loading…</p>;
  }

  switch (route.name) {
    case "login":
      return <AuthForms mode="login" />;
    case "register":
      return <AuthForms mode="register" />;
    case "new":
      return user ? <Editor /> : <AuthForms mode="login" />;
    case "edit":
      return user ? (
        <Editor id={route.params.id} />
      ) : (
        <AuthForms mode="login" />
      );
    case "post":
      return <PostPage id={route.params.id} />;
    case "home":
      return <PostList />;
    default:
      return (
        <div className="mx-auto max-w-3xl px-4 py-8">
          <h1 className="text-2xl font-bold text-slate-900">Not found</h1>
        </div>
      );
  }
}

export default function App() {
  return (
    <RouterProvider>
      <AuthProvider>
        <div className="min-h-screen bg-slate-50 text-slate-900">
          <Nav />
          <main>
            <Screen />
          </main>
        </div>
      </AuthProvider>
    </RouterProvider>
  );
}
