import { AuthProvider, useAuth } from "./auth";
import { parseRoute, useRoute } from "./router";
import { Header } from "./components/ui";
import { LoginPage } from "./components/LoginPage";
import { PostEditor } from "./components/PostEditor";
import { PostList } from "./components/PostList";
import { PostPage } from "./components/PostPage";
import type { Post } from "./types";

function Shell() {
  const { user, loading } = useAuth();
  const [path, go] = useRoute();
  const route = parseRoute(path);

  if (loading) {
    return <p className="py-20 text-center text-sm text-slate-500">Loading…</p>;
  }

  let content;
  switch (route.name) {
    case "login":
      content = user ? (
        <PostList onOpenPost={(id) => go(`/posts/${id}`)} onNavigate={go} />
      ) : (
        <LoginPage onDone={() => go("/")} />
      );
      break;
    case "new":
      content = user ? (
        <PostEditor
          postId={null}
          onSaved={(post: Post) => go(`/posts/${post.id}`)}
          onNavigate={go}
        />
      ) : (
        <LoginPage onDone={() => go("/new")} />
      );
      break;
    case "edit": {
      const id = Number(route.param);
      content =
        user && Number.isInteger(id) && id > 0 ? (
          <PostEditor
            postId={id}
            onSaved={(post: Post) => go(`/posts/${post.id}`)}
            onNavigate={go}
          />
        ) : (
          <LoginPage onDone={() => go(path)} />
        );
      break;
    }
    case "post": {
      const id = Number(route.param);
      content = Number.isInteger(id) && id > 0 ? (
        <PostPage postId={id} onNavigate={go} />
      ) : (
        <PostList onOpenPost={(pid) => go(`/posts/${pid}`)} onNavigate={go} />
      );
      break;
    }
    default:
      content = <PostList onOpenPost={(id) => go(`/posts/${id}`)} onNavigate={go} />;
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <Header onNavigate={go} />
      <main className="mx-auto max-w-3xl px-4 py-6">{content}</main>
      <footer className="mx-auto max-w-3xl px-4 pb-8 pt-2 text-center text-xs text-slate-400">
        A multi-author blog · posts are published with <code>/api</code>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
