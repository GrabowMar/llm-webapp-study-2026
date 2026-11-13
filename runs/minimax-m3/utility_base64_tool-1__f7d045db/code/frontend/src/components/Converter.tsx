import { useState } from "react";
import * as api from "../api";
import { ApiError } from "../api";
import type { Direction } from "../types";

interface ConverterProps {
  token: string | null;
  onError: (message: string | null) => void;
  onSaved: () => void;
}

export default function Converter({ token, onError, onSaved }: ConverterProps) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveToHistory, setSaveToHistory] = useState(false);
  const [copied, setCopied] = useState(false);

  async function convert(direction: Direction) {
    onError(null);
    setBusy(true);
    try {
      let result: string;
      if (token && saveToHistory) {
        const saved = await api.saveConversion(token, direction, input);
        result = saved.output;
        onSaved();
      } else if (direction === "encode") {
        result = await api.encode(input);
      } else {
        result = await api.decode(input);
      }
      setOutput(result);
    } catch (err) {
      setOutput("");
      onError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!output) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(output);
      } else {
        const area = document.createElement("textarea");
        area.value = output;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      onError("The text could not be copied to the clipboard");
    }
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Converter
        </h2>
        {token ? (
          <label
            htmlFor="save-to-history"
            className="flex cursor-pointer items-center gap-2 text-sm text-slate-300"
          >
            <input
              id="save-to-history"
              type="checkbox"
              role="switch"
              checked={saveToHistory}
              onChange={(event) => setSaveToHistory(event.target.checked)}
              className="h-5 w-5 cursor-pointer rounded border-slate-600 bg-slate-950 text-indigo-500 accent-indigo-500 focus:ring-2 focus:ring-indigo-500/50"
            />
            Save to history
          </label>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor="input-text" className="text-sm font-medium text-slate-300">
            Input
          </label>
          <textarea
            id="input-text"
            name="input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={8}
            spellCheck={false}
            placeholder="Type the text you want to convert"
            className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/40"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => convert("encode")}
              disabled={busy}
              title="Encode the input as base64"
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Encode
            </button>
            <button
              type="button"
              onClick={() => convert("decode")}
              disabled={busy}
              title="Decode the input from base64"
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Decode
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="output-text" className="text-sm font-medium text-slate-300">
            Output
          </label>
          <textarea
            id="output-text"
            name="output"
            value={output}
            readOnly
            rows={8}
            spellCheck={false}
            placeholder="The result shows up here"
            className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 font-mono text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/40"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={copy}
              disabled={!output}
              title="Copy the output to the clipboard"
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-indigo-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Copy
            </button>
            {copied ? (
              <span role="status" className="text-sm text-emerald-300">
                Copied to clipboard
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
