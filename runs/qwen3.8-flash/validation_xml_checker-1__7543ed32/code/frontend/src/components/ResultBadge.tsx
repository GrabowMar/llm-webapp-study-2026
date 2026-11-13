import type { CheckResult } from "../api";

interface Props {
  result: CheckResult;
}

export default function ResultBadge({ result }: Props) {
  if (result.valid) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold tracking-wide text-white uppercase">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path
              fillRule="evenodd"
              d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z"
              clipRule="evenodd"
            />
          </svg>
          Well-formed
        </span>
        <span className="text-sm text-emerald-900">
          root element:{" "}
          <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs text-emerald-800">
            {result.root_element ?? "?"}
          </code>
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-1 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-xs font-bold tracking-wide text-white uppercase">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path
              fillRule="evenodd"
              d="M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm0-1a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm-1-9a1 1 0 1 1 2 0v4a1 1 0 1 1-2 0V7Z"
              clipRule="evenodd"
            />
          </svg>
          Not well-formed
        </span>
        {result.root_element && (
          <span className="text-xs text-red-800">
            root so far:{" "}
            <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">
              {result.root_element}
            </code>
          </span>
        )}
      </div>
      <p className="text-sm font-medium text-red-900">
        {result.error ?? "unknown error"}
        {result.line != null && (
          <span className="ml-2 rounded bg-white px-2 py-0.5 font-mono text-xs text-red-700">
            line {result.line}
            {result.column != null ? `, column ${result.column}` : ""}
          </span>
        )}
      </p>
    </div>
  );
}
