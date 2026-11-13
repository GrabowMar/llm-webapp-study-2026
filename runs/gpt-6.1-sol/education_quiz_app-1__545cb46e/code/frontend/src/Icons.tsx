import type { CSSProperties } from "react";

export type IconName = "spark" | "grid" | "history" | "arrow" | "chevron" | "bulb" | "clock" | "check" | "close" | "logout" | "plus" | "book" | "globe" | "trophy" | "user" | "help" | "menu" | "shield" | "shuffle" | "leaf";

export function Icon({ name, size = 20, className = "", style }: { name: IconName; size?: number; className?: string; style?: CSSProperties }) {
  const paths: Record<IconName, React.ReactNode> = {
    spark: <><path d="M12 2v20M2 12h20M5 5l14 14M5 19 19 5" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
    history: <><path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2" /></>,
    arrow: <><path d="M4 12h16m-6-6 6 6-6 6" /></>,
    chevron: <path d="m9 5 7 7-7 7" />,
    bulb: <><path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2Z" /><path d="M12 1v1M3 4l1 1m16-1-1 1M1 10h2m18 0h2" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    logout: <><path d="M9 4H4v16h5m5-4 4-4-4-4m-6 4h14" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    book: <><path d="M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1Zm0 0v15" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18M5 6.5h14M5 17.5h14" /></>,
    trophy: <><path d="M7 3h10v6a5 5 0 0 1-10 0V3ZM7 5H3v3a4 4 0 0 0 5 4m9-7h4v3a4 4 0 0 1-5 4m-4 2v6m-4 1h8" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 8a2.5 2.5 0 1 1 3.5 3c-1 .5-1 1-1 2m0 3h.01" /></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    shield: <><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z" /><path d="m8 12 3 3 5-6" /></>,
    shuffle: <><path d="m3 5 4 0 10 14h4m-4-4 4 4-4 3M3 19h4l3-4m4-6 3-4h4m-4-3 4 3-4 4" /></>,
    leaf: <><path d="M20 3C9 2 3 7 4 14c1 6 9 8 13 2 2-3 3-7 3-13ZM3 21 15 9" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">{paths[name]}</svg>;
}

export function HeroIllustration() {
  return (
    <svg viewBox="0 0 410 300" fill="none" className="h-full w-full" role="img" aria-label="An illustrated globe surrounded by little discoveries">
      <ellipse cx="212" cy="270" rx="137" ry="12" fill="#cddcc7" opacity=".5" />
      <path d="M57 173C36 92 112 20 228 31c105 10 167 88 117 173-33 56-148 72-216 32" stroke="#9fb49a" strokeDasharray="4 6" />
      <g transform="rotate(-12 82 118)">
        <rect x="23" y="70" width="91" height="112" rx="12" fill="#fdfdf7" stroke="#a3b79b" strokeWidth="1.5" />
        <rect x="35" y="83" width="24" height="24" rx="7" fill="#edf1e5" />
        <path d="m42 94 5 5 8-10" stroke="#6f8d66" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M36 122h60m-60 10h47m-47 22h36" stroke="#b6c4ac" strokeWidth="4" strokeLinecap="round" />
        <circle cx="94" cy="158" r="9" fill="#d9e8be" />
        <path d="m90 158 3 3 5-6" stroke="#557148" strokeWidth="1.5" strokeLinecap="round" />
      </g>
      <g transform="rotate(12 300 89)">
        <rect x="269" y="37" width="90" height="99" rx="12" fill="#f9f8e9" stroke="#afba9c" strokeWidth="1.5" />
        <path d="M291 57h44m-44 9h31" stroke="#b6bf9c" strokeWidth="4" strokeLinecap="round" />
        <path d="m289 113 12-17 12 8 21-26" stroke="#79926a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="m325 78 9 0 0 9" stroke="#79926a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <path d="M151 252h120m-65-27v27m-30-18h60" stroke="#3b5945" strokeWidth="7" strokeLinecap="round" />
      <path d="M269 96c36 28 42 80 16 116-27 36-77 46-115 20" stroke="#3b5945" strokeWidth="7" strokeLinecap="round" />
      <path d="m168 227-10 12M270 96l10-12" stroke="#3b5945" strokeWidth="5" strokeLinecap="round" />
      <circle cx="207" cy="161" r="83" fill="#bad1a7" stroke="#3b5945" strokeWidth="2" />
      <path d="M127 141c50 24 103 38 161 39M143 108c39 27 83 36 136 36m-142 60c48 23 85 29 129 21" stroke="#7f9e75" strokeWidth="1.4" />
      <ellipse cx="207" cy="161" rx="40" ry="83" transform="rotate(-24 207 161)" stroke="#7f9e75" strokeWidth="1.4" />
      <path d="m177 84-4 15-17 4-3 16 10 10-3 17 19 7 3 17 17 1 8 22-3 13 13 25 12-4 8-25 15-9-2-18-18-10-5-15-18-3-9-19 7-13-14-15 2-14M256 101l-7 16 8 14 15 5 13 27M132 179l18 1 10 12 8 1 11 20-7 23" fill="#819f73" stroke="#719064" strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx="208" cy="161" r="83" stroke="#3b5945" strokeWidth="2" />
      <g transform="rotate(9 304 215)">
        <rect x="264" y="174" width="77" height="76" rx="18" fill="#f9f5d9" stroke="#a8ac82" strokeWidth="1.5" />
        <path d="M294 198c0-11 19-12 19-1 0 8-10 7-10 15" stroke="#6a7550" strokeWidth="5" strokeLinecap="round" />
        <circle cx="303" cy="223" r="3" fill="#6a7550" />
      </g>
      <path d="M116 36v23m-11-11h23m-19-8 15 15m-15 0 15-15" stroke="#84966a" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M355 150v17m-8-8h17M70 213v15m-7-7h15" stroke="#84966a" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="225" cy="41" r="4" fill="#8ca276" /><circle cx="100" cy="204" r="3" fill="#8ca276" />
    </svg>
  );
}
