import { useCallback, useEffect, useState } from "react";
import AuthPanel from "./components/AuthPanel";
import HistoryPanel from "./components/HistoryPanel";
import ResultBadge from "./components/ResultBadge";
import XmlEditor from "./components/XmlEditor";
import { api, ApiError } from "./api";
import type { CheckResult, SavedCheck } from "./api";

interface Session {
  token: string;
  username: string;
}

const STORAGE_KEY = "xmlcheck.session";

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (typeof parsed.token === "string" && typeof parsed.username === "string") {
      return { token: parsed.token, username: parsed.username };
    }
  } catch {
    /* ignore corrupt storage */
  }
  return null;
}

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<catalog>
  <book id="b1">
    <title>XML Basics</title>
    <price>29.99</price>
  </book>
  <book id="b2">
    <title>Greek Letters</title>
    <note>&amp; &lt; &gt; &#8212; fine</note>
  </book>
</catalog>`;

const BROKEN = `<?xml version="1.0"?>
<order id="42">
  <item sku="A-1">
    <name>Widget</name>
  </item>
  <item sku="B-2">
    <name>Gadget</name>
</order>`;

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [xml, setXml] = useState(SAMPLE);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [saved, setSaved] = useState<SavedCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [save, setSave] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  }, [session]);

  const signOut = () => {
    setSession(null);
    setSave(true);
    setSaved(null);
  };

  const check = useCallback(async () => {
    setChecking(true);
    setCheckError(null);
    setSaved(null);
    try {
      if (session && save) {
        const rec = await api.saveValidation(xml, session.token);
        setResult({
          valid: rec.valid,
          error: rec.error,
          line: rec.line,
          column: rec.column,
          root_element: rec.root_element,
        });
        setSaved(rec);
        setRefreshTick((t) => t + 1);
      } else {
        setResult(await api.validate(xml));
      }
    } catch (e) {
      setResult(null);
      if (e instanceof ApiError && e.status === 401) {
        setSession(null);
        setCheckError("Your session has ended — sign in again.");
      } else {
        setCheckError(e instanceof Error ? e.message : "check failed");
      }
    } finally {
      setChecking(false);
    }
  }, [xml, session, save]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 font-mono text-sm font-bold text-white">
            &lt;/&gt;
          </div>
          <div className="min-w-0">
            <h1 className="text-base leading-tight font-bold">XML Well-formedness Checker</h1>
            <p className="text-xs text-slate-500">
              Syntax only — nothing is fetched or resolved outside your document.
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2 text-sm">
            {session ? (
              <>
                <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
                  {session.username}
                </span>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded-lg border border-slate-300 px-3 py-1 font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Sign out
                </button>
              </>
            ) : (
              <span className="hidden text-xs text-slate-500 sm:inline">
                Anonymous — checks are not stored
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {!session && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-700">Account</h2>
            <AuthPanel onSignedIn={(token, username) => setSession({ token, username })} />
          </section>
        )}

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-700">Check a document</h2>
            <div className="flex gap-3 text-xs font-medium text-indigo-600">
              <button
                type="button"
                onClick={() => {
                  setXml(SAMPLE);
                  setResult(null);
                  setSaved(null);
                  setFileName(null);
                }}
                className="hover:underline"
              >
                Load well-formed sample
              </button>
              <button
                type="button"
                onClick={() => {
                  setXml(BROKEN);
                  setResult(null);
                  setSaved(null);
                  setFileName(null);
                }}
                className="hover:underline"
              >
                Load broken sample
              </button>
            </div>
          </div>

          <XmlEditor
            value={xml}
            onChange={(v) => {
              setXml(v);
              setSaved(null);
            }}
            highlightLine={result && !result.valid ? result.line : null}
            highlightColumn={result && !result.valid ? result.column : null}
            valid={result ? result.valid : null}
            fileName={fileName}
            onFile={(name, text) => {
              setFileName(name);
              setXml(text);
              setResult(null);
              setSaved(null);
            }}
          />

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={check}
              disabled={checking}
              className="rounded-lg bg-indigo-600 px-6 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {checking ? "Checking…" : "Check"}
            </button>

            {session ? (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <span className="relative inline-block h-5 w-9">
                  <input
                    type="checkbox"
                    checked={save}
                    onChange={(e) => setSave(e.target.checked)}
                    className="peer h-5 w-9 appearance-none rounded-full bg-slate-300 transition-colors checked:bg-emerald-500"
                  />
                  <span className="pointer-events-none absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
                </span>
                Save to history
              </label>
            ) : (
              <p className="text-xs text-slate-500">Sign in to save results to a private history.</p>
            )}

            {saved && (
              <span className="rounded-md bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800">
                Saved #{saved.id} to history
              </span>
            )}
          </div>

          {checkError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{checkError}</p>
          )}
          {result && <ResultBadge result={result} />}
        </section>

        {session && <HistoryPanel token={session.token} refreshTick={refreshTick} />}
      </main>

      <footer className="mx-auto max-w-5xl px-4 pb-8 text-center text-xs text-slate-400">
        Checks verify well-formedness only: no DTD loading, no external entities, no schema
        validation.
      </footer>
    </div>
  );
}
