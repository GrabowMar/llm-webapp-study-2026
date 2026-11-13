import { useEffect, useState, type ReactNode } from "react";

export function navigate(to: string) {
  window.location.hash = to.startsWith("#") ? to : `#${to}`;
}

export function useRoute(): string {
  const [route, setRoute] = useState(() => window.location.hash.replace(/^#/, "") || "/");
  useEffect(() => {
    const onChange = () => setRoute(window.location.hash.replace(/^#/, "") || "/");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function Link({
  to,
  className,
  children,
}: {
  to: string;
  className?: string;
  children: ReactNode;
}) {
  const href = to.startsWith("#") ? to : `#${to}`;
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}

export function matchRoute(pattern: string, route: string): Record<string, string> | null {
  const pp = pattern.split("/").filter(Boolean);
  const rp = route.split("?")[0].split("/").filter(Boolean);
  if (pp.length !== rp.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(":")) params[pp[i].slice(1)] = decodeURIComponent(rp[i]);
    else if (pp[i] !== rp[i]) return null;
  }
  return params;
}
