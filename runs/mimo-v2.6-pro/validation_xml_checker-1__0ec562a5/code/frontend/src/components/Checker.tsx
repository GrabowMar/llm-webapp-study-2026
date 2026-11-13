import { useRef, useState } from "react";
import { ApiError, checkXml, saveCheck } from "../api";
import type { CheckResult, Session } from "../types";

type Outcome = { result: CheckResult; saved: boolean };

function DocumentView({
  xml,
  errorLine,
  errorColumn,
}: {
  xml: string;
  errorLine: number;
  errorColumn: number | null;
}) {
  const lines = xml.split("\n");
  return (
    <div className="mt-3 overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-3">
      {lines.map((line, index) => {
        const number = index + 1;
        const isError = number === errorLine;
        return (
          <div key={number}>
            <div className={`flex ${isError ? "bg-red-100" : ""}`}>
              <span
                className={`w-10 shrink-0 select-none pr-3 text-right ${
                  isError ? "text-red-700" : "text-slate-400"
                }`}
              >
                {number}
              </span>
              <span
                className={`whitespace-pre-wrap break-all ${
                  isError ? "text-red-900" : "text-slate-700"
                }`}
              >
                {line || " "}
              </span>
            </div>
            {isError && errorColumn !== null && (
              <div className="flex bg-red-100">
                <span className="w-10 shrink-0 select-none pr-3 text-right text-red-700">
                  {"\u00a0"}
                </span>
                <span className="whitespace-pre text-red-700">
                  {"\u00a0".repeat(Math.max(0, errorColumn - 1))}^
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function Checker({
  session,
  onSaved,
  onSessionExpired,
}: {
  session: Session | null;
  onSaved: () => void;
  onSessionExpired: () => void;
}) {
  const [xml, setXml] = useState("");
  const [save, setSave] = useState(true);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  async function runCheck() {
    setBusy(true);
    setFailure(null);
    setOutcome(null);
    try {
      if (session && save) {
        const saved = await saveCheck(session, xml);
        setOutcome({ result: saved, saved: true });
        onSaved();
      } else {
        setOutcome({ result: await checkXml(xml), saved: false });
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onSessionExpired();
      setFailure(err instanceof Error ? err.message : "The check failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadFile(file: File) {
    setXml(await file.text());
    setFileName(file.name);
    setOutcome(null);
    setFailure(null);
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">XML document</h2>
        <div className="flex items-center gap-3">
          {session && (
            <>
              <button
                type="button"
                role="switch"
                aria-checked={save}
                aria-label="Save to history"
                onClick={() => setSave(!save)}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  save ? "bg-emerald-500" : "bg-slate-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    save ? "left-5" : "left-0.5"
                  }`}
                />
              </button>
              <span className="text-xs text-slate-600">Save to history</span>
            </>
          )}
          <input
            ref={fileInput}
            type="file"
            accept=".xml,text/xml,application/xml"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void loadFile(file);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Load file
          </button>
          <button
            type="button"
            onClick={() => void runCheck()}
            disabled={busy}
            className="rounded-md bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {busy ? "Checking\u2026" : "Check"}
          </button>
        </div>
      </div>

      <textarea
        value={xml}
        onChange={(event) => {
          setXml(event.target.value);
          setFileName(null);
        }}
        spellCheck={false}
        rows={12}
        placeholder="Paste XML here, or load a file..."
        className="mt-3 w-full rounded-md border border-slate-300 p-3 font-mono text-xs text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
      />
      {fileName && <p className="mt-1 text-xs text-slate-500">Loaded from {fileName}</p>}

      {failure && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{failure}</p>
      )}

      {outcome && (
        <div className="mt-4">
          {outcome.result.valid ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
                Well-formed
              </span>
              <span className="text-sm text-slate-600">
                Root element:{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
                  {outcome.result.root_element}
                </code>
              </span>
              {outcome.saved && <span className="text-xs text-slate-500">Saved to history</span>}
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800">
                  Not well-formed
                </span>
                {outcome.result.line !== null && (
                  <span className="text-sm text-slate-600">
                    Line {outcome.result.line}, column {outcome.result.column}
                  </span>
                )}
                {outcome.saved && <span className="text-xs text-slate-500">Saved to history</span>}
              </div>
              <p className="mt-2 text-sm text-red-700">{outcome.result.error}</p>
              {outcome.result.line !== null && (
                <DocumentView
                  xml={xml}
                  errorLine={outcome.result.line}
                  errorColumn={outcome.result.column}
                />
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
