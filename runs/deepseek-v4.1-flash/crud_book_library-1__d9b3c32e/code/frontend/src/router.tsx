import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}

function getSnapshot() {
  return window.location.pathname + window.location.search;
}

export function useLocation(): string {
  return useSyncExternalStore(subscribe, getSnapshot, () => "/");
}

export function navigate(to: string, replace = false) {
  if (replace) {
    window.history.replaceState(null, "", to);
  } else {
    window.history.pushState(null, "", to);
  }
  window.dispatchEvent(new PopStateEvent("popstate"));
}

type LinkProps = {
  to: string;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
};

export function Link({ to, className, children, onClick }: LinkProps) {
  return (
    <a
      href={to}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onClick?.();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

export function useQueryParams(): URLSearchParams {
  const loc = useLocation();
  return new URLSearchParams(loc.split("?")[1] ?? "");
}
