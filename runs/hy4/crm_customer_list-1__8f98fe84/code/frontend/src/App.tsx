import { useCallback, useEffect, useState } from "react";
import * as api from "./api";
import AuthScreen from "./AuthScreen";
import CustomerDetail from "./CustomerDetail";
import CustomerForm from "./CustomerForm";
import CustomerList from "./CustomerList";
import { Button } from "./components";

type View =
  | { name: "list" }
  | { name: "add" }
  | { name: "detail"; id: number };

export default function App() {
  const [authed, setAuthed] = useState<boolean>(() => !!api.getToken());
  const [view, setView] = useState<View>({ name: "list" });

  useEffect(() => {
    const handler = () => {
      setAuthed(false);
      setView({ name: "list" });
    };
    window.addEventListener("directory:unauthorized", handler);
    return () => window.removeEventListener("directory:unauthorized", handler);
  }, []);

  const goList = useCallback(() => setView({ name: "list" }), []);

  function signOut() {
    api.setToken(null);
    setAuthed(false);
    setView({ name: "list" });
  }

  if (!authed) {
    return (
      <AuthScreen
        onAuthenticated={() => {
          setAuthed(true);
          setView({ name: "list" });
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <button
            onClick={goList}
            className="flex items-center gap-2 text-lg font-bold text-slate-900"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm text-white">
              CD
            </span>
            Customer Directory
          </button>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        {view.name === "list" && (
          <CustomerList
            onOpen={(id) => setView({ name: "detail", id })}
            onAdd={() => setView({ name: "add" })}
          />
        )}
        {view.name === "add" && (
          <div className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <button
              onClick={goList}
              className="mb-4 text-sm font-medium text-indigo-600 hover:underline"
            >
              ← Back to customers
            </button>
            <h1 className="mb-6 text-2xl font-bold text-slate-900">
              Add customer
            </h1>
            <CustomerForm onSaved={goList} onCancel={goList} />
          </div>
        )}
        {view.name === "detail" && (
          <CustomerDetail
            id={view.id}
            onBack={goList}
            onDeleted={goList}
          />
        )}
      </main>
    </div>
  );
}
