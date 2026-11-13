import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import AuthPanel from "./components/AuthPanel";
import HistoryPanel, { type HistoryFilter } from "./components/HistoryPanel";
import ResultView from "./components/ResultView";
import {
  clearSession,
  currentUser,
  deleteValidation,
  listValidations,
  readSession,
  saveValidation,
  validateXml,
  writeSession,
  type CheckResult,
  type SavedCheck,
  type Session,
} from "./api";

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<catalog>
  <book id="1">
    <title>Well-formedness explained</title>
  </book>
</catalog>`;

const PAGE_SIZE = 10;

export default function App() {
  const [xml, setXml] = useState(SAMPLE);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  const [user, setUser] = useState<string | null>(null);
  const [saveEnabled, setSaveEnabled] = useState(false);

  const [items, setItems] = useState<SavedCheck[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [historyLoading, setHistoryLoading] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);

  const loadHistory = useCallback(
    async (targetPage: number, targetFilter: HistoryFilter) => {
      if (!readSession()) return;
      setHistoryLoading(true);
      try {
        const valid = targetFilter === "all" ? null : targetFilter === "valid";
        const data = await listValidations(targetPage, PAGE_SIZE, valid);
        setItems(data.items);
        setTotal(data.total);
        setPage(data.page);
      } catch (err) {
        setNotice({
          kind: "error",
          text: err instanceof Error ? err.message : "Could not load the history",
        });
      } finally {
        setHistoryLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const session = readSession();
    if (!session) return;
    let cancelled = false;
    currentUser()
      .then((data) => {
        if (!cancelled) setUser(data.username);
      })
      .catch(() => {
        clearSession();
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (user) {
      setPage(1);
      void loadHistory(1, filter);
    } else {
      setItems([]);
      setTotal(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const check = useCallback(async () => {
    setChecking(true);
    setNotice(null);
    try {
      const outcome = await validateXml(xml);
      setResult(outcome);
      if (readSession() && saveEnabled) {
        await saveValidation(xml);
        await loadHistory(page, filter);
        setNotice({ kind: "info", text: "Saved to your history." });
      }
    } catch (err) {
      setNotice({
        kind: "error",
        text: err instanceof Error ? err.message : "Could not check the document",
      });
    } finally {
      setChecking(false);
    }
  }, [xml, saveEnabled, page, filter, loadHistory]);

  const toggleSave = useCallback(async () => {
    const next = !saveEnabled;
    setSaveEnabled(next);
    if (next && result && readSession()) {
      try {
        await saveValidation(xml);
        await loadHistory(page, filter);
        setNotice({ kind: "info", text: "Saved to your history." });
      } catch (err) {
        setNotice({
          kind: "error",
          text: err instanceof Error ? err.message : "Could not save the check",
        });
      }
    }
  }, [saveEnabled, result, xml, page, filter, loadHistory]);

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setXml(await file.text());
      setResult(null);
      setNotice(null);
    } catch {
      setNotice({ kind: "error", text: "Could not read that file" });
    }
  };

  const onAuthenticated = (session: Session) => {
    writeSession(session);
    setUser(session.username);
  };

  const signOut = () => {
    clearSession();
    setUser(null);
    setSaveEnabled(false);
    setItems([]);
    setTotal(0);
    setNotice(null);
  };

  const onDelete = async (id: number) => {
    try {
      await deleteValidation(id);
      const remaining = items.filter((item) => item.id !== id);
      if (remaining.length === 0 && page > 1) {
        await loadHistory(page - 1, filter);
      } else {
        await loadHistory(page, filter);
      }
    } catch (err) {
      setNotice({
        kind: "error",
        text: err instanceof Error ? err.message : "Could not delete the check",
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-600/15 text-lg text-sky-400 ring-1 ring-inset ring-sky-500/30">
              &lt;/&gt;
            </span>
            <div>
              <h1 className="text-lg font-semibold leading-tight text-slate-100">
                XML Well-Formedness Checker
              </h1>
              <p className="text-xs text-slate-400">
                Syntax only — no schema validation, no external lookups.
              </p>
            </div>
          </div>

          {user ? (
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-slate-800 px-3 py-1.5 text-sm text-slate-200">
                Signed in as <span className="font-semibold text-sky-300">{user}</span>
              </span>
              <button
                type="button"
                onClick={signOut}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
              >
                Sign out
              </button>
            </div>
          ) : (
            <span className="rounded-full bg-slate-800/80 px-3 py-1.5 text-sm text-slate-400">
              Not signed in
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl shadow-black/20">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-100">XML document</h2>
              <div className="flex flex-wrap items-center gap-2">
                {user && (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={saveEnabled}
                    onClick={toggleSave}
                    className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800"
                  >
                    <span
                      className={`relative h-5 w-9 rounded-full transition ${
                        saveEnabled ? "bg-sky-600" : "bg-slate-700"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                          saveEnabled ? "left-4.5" : "left-0.5"
                        }`}
                      />
                    </span>
                    Save
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
                >
                  Load file
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setXml("");
                    setResult(null);
                    setNotice(null);
                  }}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={check}
                  disabled={checking}
                  className="rounded-lg bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {checking ? "Checking…" : "Check"}
                </button>
              </div>
            </div>

            <input
              ref={fileInput}
              type="file"
              accept=".xml,.txt,text/xml,application/xml"
              className="hidden"
              onChange={onFile}
            />

            <textarea
              value={xml}
              onChange={(event) => setXml(event.target.value)}
              spellCheck={false}
              placeholder="Paste your XML here…"
              className="mt-4 h-80 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 p-4 font-mono text-sm leading-6 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30"
            />

            {notice && (
              <p
                className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                  notice.kind === "error"
                    ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                }`}
              >
                {notice.text}
              </p>
            )}
          </section>

          <ResultView xml={xml} result={result} />
        </div>

        <aside className="space-y-6">
          {user ? (
            <HistoryPanel
              items={items}
              total={total}
              page={page}
              pageSize={PAGE_SIZE}
              filter={filter}
              loading={historyLoading}
              onFilterChange={(next) => {
                setFilter(next);
                void loadHistory(1, next);
              }}
              onPageChange={(next) => void loadHistory(next, filter)}
              onDelete={(id) => void onDelete(id)}
            />
          ) : (
            <AuthPanel onAuthenticated={onAuthenticated} />
          )}
        </aside>
      </main>

      <footer className="border-t border-slate-800 py-6 text-center text-xs text-slate-600">
        Well-formedness is checked locally against the submitted text only.
      </footer>
    </div>
  );
}
