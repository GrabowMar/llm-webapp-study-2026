import { useState } from "react";
import {
  ApiError,
  createConversion,
  decodeText,
  encodeText,
  type Direction,
} from "../api";

interface Props {
  signedIn: boolean;
  token: string | null;
  onSaved: () => void;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : "something went wrong";
}

export default function Converter({ signedIn, token, onSaved }: Props) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveToHistory, setSaveToHistory] = useState(false);
  const [copied, setCopied] = useState(false);

  const run = async (direction: Direction) => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      if (signedIn && saveToHistory && token) {
        const conv = await createConversion(direction, input, token);
        setOutput(conv.output ?? "");
        onSaved();
      } else if (direction === "encode") {
        const res = await encodeText(input);
        setOutput(res.encoded);
      } else {
        const res = await decodeText(input);
        setOutput(res.text);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : message(err));
    } finally {
      setBusy(false);
    }
  };

  const copyOutput = async () => {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("could not copy to the clipboard");
    }
  };

  const textareaClass =
    "w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200";

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold">Converter</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Input
          </label>
          <textarea
            className={textareaClass}
            rows={8}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type or paste text / base64 here"
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700">
              Output
            </label>
            <div className="flex items-center gap-2">
              {copied && (
                <span className="text-xs text-emerald-600">Copied!</span>
              )}
              <button
                type="button"
                onClick={copyOutput}
                disabled={busy}
                className="rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                Copy
              </button>
            </div>
          </div>
          <textarea
            className={textareaClass}
            rows={8}
            value={output}
            readOnly
            placeholder="Result appears here"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => run("encode")}
          disabled={busy}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Encode
        </button>
        <button
          type="button"
          onClick={() => run("decode")}
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          Decode
        </button>

        {signedIn && (
          <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={saveToHistory}
              onChange={(e) => setSaveToHistory(e.target.checked)}
            />
            <span className="relative h-6 w-11 rounded-full bg-gray-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-blue-600 peer-checked:after:translate-x-5" />
            Save to history
          </label>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
