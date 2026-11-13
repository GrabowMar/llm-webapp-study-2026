import type { SVGProps } from "react";

type IconName = "bag" | "user" | "search" | "arrow" | "chevron-left" | "chevron-right" | "plus" | "minus" | "close" | "check" | "leaf" | "box" | "heart" | "logout" | "settings" | "trash" | "grid" | "loader";

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    bag: <><path d="M5 7h14l1 14H4L5 7Z" /><path d="M8 8V6a4 4 0 0 1 8 0v2" /></>,
    user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    arrow: <><path d="M4 12h16m-6-6 6 6-6 6" /></>,
    "chevron-left": <path d="m14 5-7 7 7 7" />,
    "chevron-right": <path d="m10 5 7 7-7 7" />,
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    leaf: <><path d="M20 3C9 2 3 7 5 14c2 7 15 5 15-11Z" /><path d="M3 21 15 9" /></>,
    box: <><path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 10v9M3 8l9 5 9-5M7.5 5.5l9 5v4" /></>,
    heart: <path d="M20.5 5.5a5 5 0 0 0-7 0L12 7l-1.5-1.5a5 5 0 0 0-7 7L12 21l8.5-8.5a5 5 0 0 0 0-7Z" />,
    logout: <><path d="M9 3H4v18h5m6-14 5 5-5 5M8 12h12" /></>,
    settings: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" fill="currentColor" /><circle cx="16" cy="17" r="3" fill="currentColor" /></>,
    trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    loader: <path d="M21 12a9 9 0 1 1-9-9" />,
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}

export function BrandMark({ className = "" }: { className?: string }) {
  return <svg className={className} width="29" height="29" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><path d="M3 3h11v11H3zM18 3h11v11H18zM3 18h11v11H3zM18 18h11v11H18z" /><path d="M14 14h4v4h-4z" /></svg>;
}
