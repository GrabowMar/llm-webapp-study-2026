import { useEffect, useRef, useState } from "react";
import {
  api,
  ApiError,
  clearSession,
  getUsername,
  saveSession,
  type SavedValidation,
  type ValidationResult,
} from "./api";

function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}

function Badge({ valid }: { valid: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
        valid ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
      }`}
    >
      {valid ? "Well-formed" : "Not well-formed"}
    </span>
  );
}

export default function App() {
  const [username, setUsername] = useState<string | null>(getUsername());
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authUser, setAuthUser] = useState("");
  const [authPass, setAuthPass] = useState("");
  const [authError, setAuthError] = useState("");

  const [xml, setXml] = useState("");
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [save, setSave] = useState(false);
  const [resultError, setResultError] = useState("");
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (username) {
      refreshList();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    const name = authUser;
    const proceed = authMode === "login"
      ? api.login(authUser, authPass)
      : api.register(authUser, authPass).then(() => api.login(authUser, authPass));
    proceed
      .then((res) => {
        saveSession(res.token, name);
        setUsername(name);
        setAuthUser("");
        setAuthPass("");
        setAuthError("");
      })
      .catch((err: ApiError) => setAuthError(err.message));
  }

  function handleSignOut() {
    clearSession();
    setUsername(null);
    setList({ items: [], total: 0, page: 1, page_size: 10 });
    setListPage(1);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setXml(String(reader.result ?? ""));
    reader.readAsText(file);
    e.target.value = "";
  }

  function handleCheck() {
    setChecking(true);
    setResult(null);
    setResultError("");
    api
      .validate(xml)
      .then((res) => {
        setResult(res);
        if (save && username) {
          return api.save(xml).then(() => {
            refreshList();
            setListPage(1);
          });
        }
      })
      .catch((err: ApiError) => setResultError(err.message))
      .finally(() => setChecking(false));
  }

  const [list, setList] = useState<{
    items: SavedValidation[];
    total: number;
    page: number;
    page_size: number;
  }>({ items: [], total: 0, page: 1, page_size: 10 });
  const [listFilter, setListFilter] = useState("");
  const [listPage, setListPage] = useState(1);

  function refreshList() {
    api
      .list({ valid: listFilter || undefined, page: listPage, page_size: 10 })
      .then(setList)
      .catch(() => {});
  }

  useEffect(() => {
    if (username) refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listFilter, listPage]);

  function handleDelete(id: number) {
    api
      .remove(id)
      .then(() => refreshList())
      .catch(() => {});
  }

  const highlightedLine = result && !result.valid && result.line ? result.line : null;
  const totalPages = Math.max(1, Math.ceil(list.total / list.page_size));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <h1 className="text-lg font-bold">XML Well-formedness Checker</h1>
          <div className="flex items-center gap-3">
            {username ? (
              <>
                <span className="text-sm font-medium">{username}</span>
                <button
                  onClick={handleSignOut}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
                >
                  Sign out
                </button>
              </>
            ) : (
              <span className="text-sm text-slate-500">Not signed in</span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 px-4 py-8">
        {!username && (
          <section className="rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-base font-semibold">Sign in</h2>
            <div className="mb-4 flex gap-2">
              <button
                onClick={() => setAuthMode("login")}
                className={`rounded-md px-4 py-1.5 text-sm font-medium ${
                  authMode === "login"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 hover:bg-slate-200"
                }`}
              >
                Log in
              </button>
              <button
                onClick={() => setAuthMode("register")}
                className={`rounded-md px-4 py-1.5 text-sm font-medium ${
                  authMode === "register"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 hover:bg-slate-200"
                }`}
              >
                Register
              </button>
            </div>
            <form onSubmit={handleAuthSubmit} className="space-y-3">
              <input
                type="text"
                value={authUser}
                onChange={(e) => setAuthUser(e.target.value)}
                placeholder="Username"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="password"
                value={authPass}
                onChange={(e) => setAuthPass(e.target.value)}
                placeholder="Password"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              {authError && <p className="text-sm text-red-600">{authError}</p>}
              <button
                type="submit"
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                {authMode === "login" ? "Log in" : "Register"}
              </button>
            </form>
          </section>
        )}

        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Check a document</h2>
            <label className="cursor-pointer text-sm text-blue-600 hover:underline">
              Load file…
              <input type="file" accept=".xml,text/xml,application/xml" className="hidden" onChange={handleFile} />
            </label>
          </div>
          <textarea
            ref={textAreaRef}
            value={xml}
            onChange={(e) => setXml(e.target.value)}
            rows={12}
            spellCheck={false}
            className="w-full rounded-md border border-slate-300 p-3 font-mono text-sm"
            placeholder="<root><child>...</child></root>"
          />
          <div className="mt-3 flex items-center gap-4">
            <button
              onClick={handleCheck}
              disabled={checking}
              className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {checking ? "Checking…" : "Check"}
            </button>
            {username && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={save}
                  onChange={(e) => setSave(e.target.checked)}
                  className="h-4 w-4"
                />
                Save to history
              </label>
            )}
          </div>

          {resultError && <p className="mt-3 text-sm text-red-600">{resultError}</p>}

          {result && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-3">
                <Badge valid={result.valid} />
                {result.valid && result.root_element && (
                  <span className="text-sm text-slate-600">
                    Root element: <span className="font-mono font-semibold">{result.root_element}</span>
                  </span>
                )}
              </div>
              {!result.valid && (
                <p className="text-sm text-red-600">
                  {result.error}
                  {result.line != null && result.column != null && (
                    <span className="text-slate-500">
                      {" "}
                      (line {result.line}, column {result.column})
                    </span>
                  )}
                </p>
              )}
            </div>
          )}

          {highlightedLine != null && (
            <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
              <div className="bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-500">
                Line {highlightedLine}
              </div>
              <pre className="overflow-x-auto p-3 text-sm">
                {xml.split("\n").map((line, i) => (
                  <div
                    key={i}
                    className={
                      i + 1 === highlightedLine
                        ? "bg-red-100"
                        : undefined
                    }
                  >
                    <span className="mr-3 inline-block w-8 select-none text-right text-slate-400">
                      {i + 1}
                    </span>
                    {line || " "}
                  </div>
                ))}
              </pre>
            </div>
          )}
        </section>

        {username && (
          <section className="rounded-lg border border-slate-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">Saved checks</h2>
              <div className="flex items-center gap-2">
                <select
                  value={listFilter}
                  onChange={(e) => {
                    setListFilter(e.target.value);
                    setListPage(1);
                  }}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                >
                  <option value="">All</option>
                  <option value="true">Valid</option>
                  <option value="false">Invalid</option>
                </select>
              </div>
            </div>

            {list.items.length === 0 ? (
              <p className="text-sm text-slate-500">No saved checks.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {list.items.map((item) => (
                  <li key={item.id} className="flex items-start gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge valid={item.valid} />
                        {item.root_element && (
                          <span className="truncate text-xs text-slate-500">
                            {item.root_element}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate font-mono text-xs text-slate-600">
                        {item.xml_preview}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {new Date(item.created_at).toLocaleString()}
                        {!item.valid && item.error && (
                          <>
                            {" "}
                            · {item.error}
                            {item.line != null && ` (line ${item.line}, column ${item.column})`}
                          </>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {list.total > list.page_size && (
              <div className="mt-4 flex items-center justify-between text-sm">
                <button
                  onClick={() => setListPage((p) => Math.max(1, p - 1))}
                  disabled={list.page <= 1}
                  className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-slate-500">
                  Page {list.page} of {totalPages} ({list.total} total)
                </span>
                <button
                  onClick={() => setListPage((p) => p + 1)}
                  disabled={list.page >= totalPages}
                  className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
