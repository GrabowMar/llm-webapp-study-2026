import { useCallback, useEffect, useState } from "react";

export function currentPath(): string {
  const path = window.location.pathname.replace(/\/+$/, "");
  return path || "/";
}

export function navigate(path: string) {
  if (currentPath() === path) {
    window.dispatchEvent(new PopStateEvent("popstate"));
    return;
  }
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function useRoute() {
  const [path, setPath] = useState(currentPath);

  useEffect(() => {
    const onChange = () => setPath(currentPath());
    window.addEventListener("popstate", onChange);
    return () => window.removeEventListener("popstate", onChange);
  }, []);

  const go = useCallback((target: string) => navigate(target), []);
  return { path, navigate: go };
}

export function parseNoteId(path: string, prefix: string): number | null {
  if (!path.startsWith(prefix)) return null;
  const rest = path.slice(prefix.length);
  if (!/^\d+$/.test(rest)) return null;
  return Number(rest);
}
