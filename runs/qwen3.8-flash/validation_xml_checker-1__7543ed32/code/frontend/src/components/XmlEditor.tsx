import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { UIEvent } from "react";

const LH = 21;
const PAD_Y = 12;
const PAD_X = 10;

interface Props {
  value: string;
  onChange: (value: string) => void;
  highlightLine: number | null;
  highlightColumn: number | null;
  valid: boolean | null;
  fileName: string | null;
  onFile: (name: string, text: string) => void;
}

export default function XmlEditor({
  value,
  onChange,
  highlightLine,
  highlightColumn,
  valid,
  fileName,
  onFile,
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const [charW, setCharW] = useState(8.4);

  const lines = useMemo(() => value.split("\n").map((l) => l.replace(/\r$/, "")), [value]);
  const hlIdx = highlightLine != null && highlightLine >= 1 ? highlightLine - 1 : null;
  const hlValid = hlIdx != null && hlIdx >= 0 && hlIdx < lines.length;
  const column = highlightColumn ?? 0;

  useLayoutEffect(() => {
    if (probeRef.current) {
      const w = probeRef.current.getBoundingClientRect().width / 10;
      if (w > 0) setCharW(w);
    }
  }, []);

  useEffect(() => {
    const ta = taRef.current;
    if (ta && hlValid) {
      ta.scrollTop = Math.max(0, (hlIdx - 4) * LH);
    }
  }, [highlightLine, highlightColumn, hlIdx, hlValid]);

  function handleScroll(e: UIEvent<HTMLTextAreaElement>) {
    setScroll({ top: e.currentTarget.scrollTop, left: e.currentTarget.scrollLeft });
  }

  const areaH = areaRef.current?.clientHeight ?? 0;
  const first = Math.max(0, Math.floor((scroll.top - PAD_Y) / LH) - 1);
  const last = Math.min(lines.length - 1, Math.ceil((scroll.top + areaH) / LH));

  function loadFile(name: string, file: File) {
    const reader = new FileReader();
    reader.onload = () => onFile(name, String(reader.result ?? ""));
    reader.readAsText(file);
  }

  const border =
    valid === true ? "border-emerald-400" : valid === false ? "border-red-400" : "border-slate-300";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Load file…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xml,.xsd,.xsl,.svg,.html,.htm,.txt,text/xml,application/xml"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) loadFile(f.name, f);
            e.target.value = "";
          }}
        />
        {fileName && (
          <span className="max-w-48 truncate rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
            {fileName}
          </span>
        )}
        <span className="ml-auto text-xs text-slate-500">
          {lines.length} line{lines.length === 1 ? "" : "s"} · {value.length} chars
        </span>
      </div>

      <div className={`flex overflow-hidden rounded-xl border shadow-sm ${border}`}>
        <div aria-hidden className="relative w-12 shrink-0 overflow-hidden bg-slate-50">
          {Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => {
            const n = first + i;
            const isHl = n === hlIdx && hlValid && valid === false;
            return (
              <div
                key={n}
                className={`absolute right-2 font-mono text-xs leading-[21px] ${
                  isHl ? "font-bold text-red-600" : "text-slate-400"
                }`}
                style={{ top: PAD_Y + n * LH - scroll.top }}
              >
                {n + 1}
              </div>
            );
          })}
        </div>

        <div ref={areaRef} className="relative h-80 min-w-0 flex-1">
          <span
            ref={probeRef}
            aria-hidden
            className="pointer-events-none absolute top-[-9999px] left-0 font-mono text-sm leading-[21px] whitespace-pre"
          >
            0000000000
          </span>

          {hlValid && (
            <div
              aria-hidden
              className="pointer-events-none absolute right-0 left-0 bg-red-200/60"
              style={{ top: PAD_Y + hlIdx * LH - scroll.top, height: LH }}
            />
          )}
          {hlValid && highlightColumn != null && (
            <div
              aria-hidden
              className="pointer-events-none absolute w-[7px] -translate-x-[3px] border-x-2 border-red-600 bg-red-500/40"
              style={{
                top: PAD_Y + hlIdx * LH - scroll.top,
                left: PAD_X + column * charW - scroll.left,
                height: LH,
              }}
            />
          )}

          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onScroll={handleScroll}
            spellCheck={false}
            wrap="off"
            placeholder={"<root>\n  <child/>\n</root>"}
            className="absolute inset-0 h-full w-full resize-none bg-transparent px-2.5 py-3 font-mono text-sm leading-[21px] text-slate-800 outline-none placeholder:text-slate-400"
          />
        </div>
      </div>
    </div>
  );
}
