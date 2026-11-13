import { useState } from "react";
import { apiFetch } from "../api";
import type { Conversion, Direction, Session } from "../api";

interface Props {
  session: Session | null;
  onSaved: () => void;
}

export default function Converter({ session, onSaved }: Props) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saveToHistory, setSaveToHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const persist = Boolean(session) && saveToHistory;

  async function convert(direction: Direction) {
    setBusy(true);
    setError(null);
    try {
      if (session && persist) {
        const conversion = await apiFetch<Conversion>("/api/conversions", {
          method: "POST",
          token: session.token,
          body: { direction, input },
        });
        setOutput(conversion.output ?? "");
        onSaved();
      } else if (direction === "encode") {
        const result = await apiFetch<{ encoded: string }>("/api/base64/encode", {
          method: "POST",
          body: { text: input },
        });
        setOutput(result.encoded);
      } else {
        const result = await apiFetch<{ text: string }>("/api/base64/decode", {
          method: "POST",
          body: { encoded: input },
        });
        setOutput(result.text);
      }
    } catch (err) {
      setOutput("");
      setError(err instanceof Error ? err.message : "Conversion failed");
    } finally {
      setBusy(false);
    }
  }

  async function copyOutput() {
    if (!output) {
      return;
    }
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy to the clipboard");
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Converter</h2>
        {session ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              role="switch"
              checked={saveToHistory}
              onChange={(event) => setSaveToHistory(event.target.checked)}
              className="h-4 w-4 accent-slate-900"
            />
            Save to history
          </label>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="converter-input" className="block text-sm font-medium text-slate-700">
            Input
          </label>
          <textarea
            id="converter-input"
            aria-label="Input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Text to encode or base64 to decode"
            rows={8}
            className="mt-1 w-full resize-y rounded-lg border border-slate-300 p-3 font-mono text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none"
          />
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => convert("encode")}
              disabled={busy}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              Encode
            </button>
            <button
              type="button"
              onClick={() => convert("decode")}
              disabled={busy}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50"
            >
              Decode
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="converter-output" className="block text-sm font-medium text-slate-700">
            Output
          </label>
          <textarea
            id="converter-output"
            aria-label="Output"
            value={output}
            readOnly
            placeholder="Result"
            rows={8}
            className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={copyOutput}
              disabled={!output}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50"
            >
              Copy
            </button>
            <span className="text-sm text-slate-500" aria-live="polite">
              {copied ? "Copied!" : ""}
            </span>
          </div>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </section>
  );
}
