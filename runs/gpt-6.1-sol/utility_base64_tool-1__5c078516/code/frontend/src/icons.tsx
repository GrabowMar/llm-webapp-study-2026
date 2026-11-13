type IconName = "arrow" | "swap" | "copy" | "check" | "close" | "history" | "lock" | "code" | "globe" | "shield" | "bolt" | "chevron" | "trash" | "logout" | "clipboard" | "info" | "plus" | "user";

const paths: Record<IconName, ReactNode> = {
  arrow: <><path d="M4 12h16m-6-6 6 6-6 6" /></>,
  swap: <><path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4" /></>,
  copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  history: <><path d="M3 11a9 9 0 1 1 2.7 7M3 4v7h7M12 7v5l3 2" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
  code: <path d="m7 6-6 6 6 6m10-12 6 6-6 6m-3-15-4 18" />,
  globe: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></>,
  shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8 12 3 3 5-6" /></>,
  bolt: <path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></>,
  logout: <><path d="M9 3H4v18h5m5-9H8m7-4 4 4-4 4m-1-4h7" /></>,
  clipboard: <><rect x="8" y="3" width="8" height="4" rx="1" /><path d="M8 5H5v16h14V5h-3" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v.1" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
};

export default function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
import type { ReactNode } from "react";
