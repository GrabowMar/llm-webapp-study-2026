import type { CSSProperties } from "react";

const paths = {
  link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2",
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  arrow: "M4 12h16 M14 6l6 6-6 6",
  external: "M14 3h7v7 M21 3l-10 10 M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5",
  copy: "M9 9h11v12H9z M15 9V3H3v12h6",
  check: "M5 12l4 4L19 6",
  x: "M6 6l12 12 M6 18 18 6",
  search: "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  trash: "M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7",
  shield: "M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 11l3 3 5-5",
  logout: "M9 3H4v18h5 M9 12h12 M17 8l4 4-4 4",
  user: "M20 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2 M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  refresh: "M20 7v5h-5 M4 17v-5h5 M6 6a8 8 0 0 1 13 2l1 4 M18 18a8 8 0 0 1-13-2l-1-4",
  clock: "M12 8v4l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  left: "M15 6l-6 6 6 6",
  right: "M9 6l6 6-6 6",
  cursor: "M4 3l7 18 3-7 7-3z M14 14l6 6",
  plus: "M12 5v14 M5 12h14",
  lock: "M5 10h14v11H5z M8 10V6a4 4 0 0 1 8 0v4 M12 14v3",
  globe: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M2 12h20 M12 2a20 20 0 0 1 0 20 20 20 0 0 1 0-20",
  pause: "M8 5v14 M16 5v14",
  play: "M7 4l14 8-14 8z",
  spark: "M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z",
  chart: "M4 20h17 M7 15v-4 M12 15V7 M17 15V3",
};

export type IconName = keyof typeof paths;

export default function Icon({ name, className = "h-5 w-5", style }: { name: IconName; className?: string; style?: CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
