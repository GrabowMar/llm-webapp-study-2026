import { AuthProvider, useAuth } from "./auth";
import { Layout } from "./components/Layout";
import { Spinner } from "./components/ui";
import { AuthPage } from "./pages/AuthPage";
import { EditorPage } from "./pages/EditorPage";
import { PostListPage } from "./pages/PostListPage";
import { PostPage } from "./pages/PostPage";
import { RouterProvider, useRouter } from "./router";

function Routes() {
  const { path } = useRouter();
  const { loading } = useAuth();

  if (loading) {
    return (
      <Layout>
        <Spinner />
      </Layout>
    );
  }

  let page;
  if (path === "/" || path === "") {
    page = <PostListPage />;
  } else if (path === "/login") {
    page = <AuthPage mode="login" />;
  } else if (path === "/register") {
    page = <AuthPage mode="register" />;
  } else if (path === "/new") {
    page = <EditorPage key="new" />;
  } else if (/^\/posts\/\d+$/.test(path)) {
    page = <PostPage key={path} id={Number(path.split("/")[2])} />;
  } else if (/^\/posts\/\d+\/edit$/.test(path)) {
    page = <EditorPage key={path} id={Number(path.split("/")[2])} />;
  } else {
    page = (
      <div className="py-20 text-center">
        <h1 className="text-2xl font-bold">Page not found</h1>
        <p className="mt-2 text-slate-500">The page you asked for does not exist.</p>
      </div>
    );
  }

  return <Layout>{page}</Layout>;
}

export default function App() {
  return (
    <RouterProvider>
      <AuthProvider>
        <Routes />
      </AuthProvider>
    </RouterProvider>
  );
}
