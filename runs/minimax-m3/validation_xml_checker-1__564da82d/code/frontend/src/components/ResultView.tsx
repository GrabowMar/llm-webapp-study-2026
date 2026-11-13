import type { CheckResult } from "../api";

interface Props {
  xml: string;
  result: CheckResult | null;
}

export default function ResultView({ xml, result }: Props) {
  if (!result) return null;

  const lines = xml.split("\n");
  const errorLine = result.valid ? null : result.line;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl shadow-black/20">
      <div className="flex flex-wrap items-center gap-3">
        {result.valid ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-500/40">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Well-formed
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full bg-rose-500/15 px-3 py-1 text-sm font-semibold text-rose-300 ring-1 ring-inset ring-rose-500/40">
            <span className="h-2 w-2 rounded-full bg-rose-400" />
            Not well-formed
          </span>
        )}

        {result.valid && result.root_element && (
          <p className="text-sm text-slate-300">
            Root element:{" "}
            <code className="rounded bg-slate-800 px-1.5 py-0.5 text-sky-300">
              &lt;{result.root_element}&gt;
            </code>
          </p>
        )}

        {!result.valid && (
          <p className="text-sm text-slate-300">
            <span className="font-medium text-rose-300">{result.error}</span>
            {result.line !== null && result.column !== null && (
              <span className="ml-2 text-slate-400">
                (line {result.line}, column {result.column})
              </span>
            )}
          </p>
        )}
      </div>

      <div className="mt-4 max-h-64 overflow-auto rounded-lg border border-slate-800 bg-slate-950/70 font-mono text-xs leading-5">
        {lines.map((line, index) => {
          const number = index + 1;
          const isErrorLine = errorLine === number;
          const column = isErrorLine && result.column !== null ? result.column : null;
          const cut = column !== null ? column - 1 : -1;
          return (
            <div
              key={number}
              className={`flex gap-3 px-3 ${
                isErrorLine ? "bg-rose-500/15" : "hover:bg-slate-900/60"
              }`}
            >
              <span
                className={`w-10 shrink-0 select-none text-right ${
                  isErrorLine ? "text-rose-400" : "text-slate-600"
                }`}
              >
                {number}
              </span>
              <span className={`whitespace-pre ${isErrorLine ? "text-rose-100" : "text-slate-400"}`}>
                {isErrorLine && cut >= 0 ? (
                  <>
                    {line.slice(0, cut)}
                    <span className="rounded bg-rose-500/50 font-semibold text-white">
                      {line.slice(cut, cut + 1) || " "}
                    </span>
                    {line.slice(cut + 1)}
                  </>
                ) : (
                  line || " "
                )}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
