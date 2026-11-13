import { useEffect, useState } from "react";
import AuthForm from "./components/AuthForm";
import Header from "./components/Header";
import NoteDetail from "./components/NoteDetail";
import NoteForm from "./components/NoteForm";
import NoteList from "./components/NoteList";
import { useAuth } from "./auth";
import { navigate, parseNoteId, useRoute } from "./router";

export default function App() {
  const { token } = useAuth();
  const { path } = useRoute();

  const [tag, setTag] = useState("");
  const [author, setAuthor] = useState("");
  const [query, setQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const editMatch = /^\/notes\/(\d+)\/edit$/.exec(path);
  const editId = editMatch ? Number(editMatch[1]) : null;
  const detailId = editId === null ? parseNoteId(path, "/notes/") : null;

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [path]);

  const bump = () => setRefreshKey((key) => key + 1);

  let content: React.ReactNode;

  if (path === "/login" || path === "/register") {
    content = (
      <AuthForm
        mode={path === "/register" ? "register" : "login"}
        onDone={() => navigate("/")}
        onSwitch={() => navigate(path === "/login" ? "/register" : "/login")}
      />
    );
  } else if (path === "/notes/new") {
    content = token ? (
      <NoteForm onChanged={bump} />
    ) : (
      <SignInRequired />
    );
  } else if (editId !== null) {
    content = token ? (
      <NoteForm noteId={editId} onChanged={bump} />
    ) : (
      <SignInRequired />
    );
  } else if (detailId !== null) {
    content = <NoteDetail id={detailId} onChanged={bump} />;
  } else if (path === "/" || path === "") {
    content = (
      <NoteList
        tag={tag}
        author={author}
        query={query}
        onTagChange={setTag}
        onAuthorChange={setAuthor}
        onQueryChange={setQuery}
        refreshKey={refreshKey}
      />
    );
  } else {
    content = (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Page not found</h1>
        <button
          onClick={() => navigate("/")}
          className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Back to notes
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-8">{content}</main>
    </div>
  );
}

function SignInRequired() {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <h1 className="text-xl font-semibold text-slate-900">Sign in required</h1>
      <p className="mt-2 text-sm text-slate-500">
        You need an account to write notes.
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <button
          onClick={() => navigate("/login")}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Sign in
        </button>
        <button
          onClick={() => navigate("/register")}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Register
        </button>
      </div>
    </div>
  );
}
