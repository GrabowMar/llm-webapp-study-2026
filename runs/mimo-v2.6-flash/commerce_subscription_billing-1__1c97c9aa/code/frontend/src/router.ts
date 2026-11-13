import { useEffect, useState, useSyncExternalStore } from "react";
import { getAuth, subscribeAuth, type AuthSnapshot } from "./api";

export function navigate(to: string): void {
  if (window.location.pathname === to) return;
  window.history.pushState({}, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function usePathname(): string {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const onChange = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onChange);
    return () => window.removeEventListener("popstate", onChange);
  }, []);
  return path;
}

export function useAuth(): AuthSnapshot {
  return useSyncExternalStore(subscribeAuth, getAuth, getAuth);
}
