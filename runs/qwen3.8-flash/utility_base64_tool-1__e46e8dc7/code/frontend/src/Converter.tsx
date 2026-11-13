import { useState } from "react";
import { ApiError, decodeText, encodeText, saveConversion } from "./api";

interface Props {
  token: string | null;
  onSave: () => void;
}

export default function Converter({ token, onSave }: Props) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [saveToHistory, setSaveToHistory] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function run(direction: "encode" | "decode") {
    setBusy(true);
    setError(null);
    setSaved(null);
    setCopied(false);
    try {
      let result: string;
      if (token && saveToHistory) {
        const conv = await saveConversion(token, direction, input);
        result = conv.output ?? "";
        setSaved(conv.id);
        onSave();
      } else if (direction === "encode") {
        result = (await encodeText(input)).encoded;
      } else {
        result = (await decodeText(input)).text;
      }
      setOutput(result);
    } catch (err) {
      setOutput("");
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy to clipboard");
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Input</span>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Text or base64…"
            rows={6}
            className="w-full resize-y rounded-lg border border-slate-300 p-3 font-mono text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Output</span>
          <textarea
            value={output}
            readOnly
            rows={6}
            placeholder="Result appears here"
            className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-sm text-slate-800"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => run("encode")}
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
        >
          Encode
        </button>
        <button
          onClick={() => run("decode")}
          disabled={busy}
          className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          Decode
        </button>
        <button
          onClick={copy}
          disabled={busy || !output}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {copied ? "Copied!" : "Copy"}
        </button>

        {token && (
          <label className="ml-auto flex cursor-pointer select-none items-center gap-2 text-sm text-slate-600">
            Save to history
            <button
              type="button"
              role="switch"
              aria-checked={saveToHistory}
              onClick={() => setSaveToHistory((v) => !v)}
              className={`relative h-6 w-11 rounded-full transition ${
                saveToHistory ? "bg-indigo-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  saveToHistory ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
          </label>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {saved && !error && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Saved to history.
        </p>
      )}
    </section>
  );
}
