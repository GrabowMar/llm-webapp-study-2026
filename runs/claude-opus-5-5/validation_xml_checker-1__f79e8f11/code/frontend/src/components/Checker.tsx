import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { api, type CheckResult } from "../api";

interface Props {
  token: string | null;
  onSaved: () => void;
  onAuthError: (err: unknown) => void;
}

const LINE_HEIGHT = 24;
const PADDING_TOP = 12;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<catalog>
  <book id="bk101">
    <title>XML Developer's Guide</title>
    <price>44.95</price>
  </book>
</catalog>
`;

export default function Checker({ token, onSaved, onAuthError }: Props) {
  const [xml, setXml] = useState(SAMPLE);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [checkedXml, setCheckedXml] = useState<string | null>(null);
  const [save, setSave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const lineCount = Math.max(1, xml.split("\n").length);
  const stale = checkedXml !== null && checkedXml !== xml;
  const errorLine = result && !result.valid && !stale ? result.line : null;

  useEffect(() => {
    if (!result || result.valid || result.line == null) return;
    const ta = textareaRef.current;
    if (!ta) return;
    const target = PADDING_TOP + (result.line - 1) * LINE_HEIGHT;
    if (target < ta.scrollTop || target + LINE_HEIGHT > ta.scrollTop + ta.clientHeight) {
      ta.scrollTop = Math.max(0, target - ta.clientHeight / 2);
    }
  }, [result]);

  const runCheck = async () => {
    setBusy(true);
    setError(null);
    setSaveNote(null);
    const submitted = xml;
    try {
      let res: CheckResult;
      if (token && save) {
        res = await api.save(token, submitted);
        setSaveNote("Saved to your history.");
        onSaved();
      } else {
        res = await api.check(submitted);
      }
      setResult(res);
      setCheckedXml(submitted);
    } catch (err) {
      onAuthError(err);
      setError(err instanceof Error ? err.message : "Check failed");
    } finally {
      setBusy(false);
    }
  };

  const goToError = () => {
    const ta = textareaRef.current;
    if (!ta || !result || result.line == null) return;
    const lines = xml.split("\n");
    let offset = 0;
    for (let i = 0; i < result.line - 1 && i < lines.length; i++) offset += lines[i].length + 1;
    offset += Math.max(0, (result.column ?? 1) - 1);
    offset = Math.min(offset, xml.length);
    ta.focus();
    ta.setSelectionRange(offset, offset);
  };

  const loadFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError("File is too large (max 5 MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setXml(String(reader.result ?? ""));
      setFileName(file.name);
      setResult(null);
      setCheckedXml(null);
      setError(null);
      setSaveNote(null);
    };
    reader.onerror = () => setError("Could not read the file.");
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
            >
              Load file…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xml,.xsd,.xsl,.xslt,.svg,.rss,.atom,.xhtml,.txt,text/xml,application/xml,text/plain"
              onChange={loadFile}
              className="hidden"
              data-testid="file-input"
            />
            {fileName && <span className="truncate text-xs text-slate-500">{fileName}</span>}
            <button
              type="button"
              onClick={() => {
                setXml("");
                setResult(null);
                setCheckedXml(null);
                setFileName(null);
              }}
              className="rounded-md px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              Clear
            </button>
          </div>
          <span className="text-xs text-slate-400">
            {lineCount} line{lineCount === 1 ? "" : "s"} · {xml.length} chars
          </span>
        </div>

        <div className="relative flex h-[28rem] overflow-hidden font-mono text-sm">
          <div
            aria-hidden
            className="relative w-12 shrink-0 overflow-hidden border-r border-slate-200 bg-slate-50 text-right text-slate-400 select-none"
          >
            <div style={{ transform: `translateY(${PADDING_TOP - scrollTop}px)` }}>
              {Array.from({ length: lineCount }, (_, i) => (
                <div
                  key={i}
                  className={`h-6 pr-2 leading-6 ${errorLine === i + 1 ? "bg-red-200 font-semibold text-red-700" : ""}`}
                >
                  {i + 1}
                </div>
              ))}
            </div>
          </div>
          <div className="relative min-w-0 flex-1">
            {errorLine != null && (
              <div
                aria-hidden
                data-testid="error-line-highlight"
                className="pointer-events-none absolute right-0 left-0 h-6 border-y border-red-200 bg-red-100"
                style={{ top: PADDING_TOP + (errorLine - 1) * LINE_HEIGHT - scrollTop }}
              >
                {result?.column != null && (
                  <div
                    className="absolute top-0 h-6 w-[1ch] bg-red-300"
                    style={{ left: `calc(12px + ${result.column - 1}ch - ${scrollLeft}px)` }}
                  />
                )}
              </div>
            )}
            <textarea
              ref={textareaRef}
              aria-label="XML document"
              value={xml}
              onChange={(e) => setXml(e.target.value)}
              onScroll={(e) => {
                setScrollTop(e.currentTarget.scrollTop);
                setScrollLeft(e.currentTarget.scrollLeft);
              }}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  if (!busy) void runCheck();
                }
              }}
              spellCheck={false}
              wrap="off"
              placeholder="Paste or type your XML here…"
              className="relative block h-full w-full resize-none overflow-auto bg-transparent px-3 py-3 leading-6 whitespace-pre text-slate-900 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-3 py-2">
          <div className="flex items-center gap-2">
            {token ? (
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <button
                  type="button"
                  role="switch"
                  aria-checked={save}
                  aria-labelledby="save-switch-label"
                  onClick={() => setSave((s) => !s)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    save ? "bg-blue-600" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      save ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </button>
                <span id="save-switch-label" className="cursor-pointer select-none" onClick={() => setSave((s) => !s)}>
                  Save
                </span>
              </div>
            ) : (
              <span className="text-xs text-slate-500">Sign in to save checks to your history.</span>
            )}
          </div>
          <button
            type="button"
            onClick={runCheck}
            disabled={busy}
            className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Checking…" : "Check"}
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {result && (
        <div data-testid="result" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" aria-live="polite">
          {result.valid ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-green-600 px-3 py-1 text-sm font-semibold text-white">Well-formed</span>
              <span className="text-sm text-slate-700">
                {result.root_element ? (
                  <>
                    Root element: <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">&lt;{result.root_element}&gt;</code>
                  </>
                ) : (
                  "No root element"
                )}
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-red-600 px-3 py-1 text-sm font-semibold text-white">Not well-formed</span>
                {result.line != null && (
                  <button
                    type="button"
                    onClick={goToError}
                    className="text-sm font-medium text-red-700 underline hover:text-red-900"
                  >
                    Line {result.line}, column {result.column}
                  </button>
                )}
              </div>
              <p className="font-mono text-sm text-red-800">{result.error}</p>
            </div>
          )}
          {stale && <p className="mt-2 text-xs text-amber-700">The document changed since this check — press Check again.</p>}
          {saveNote && <p className="mt-2 text-xs text-slate-500">{saveNote}</p>}
        </div>
      )}
    </div>
  );
}
