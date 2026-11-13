import { useEffect, useState, type MouseEvent, type ReactNode } from "react";

export function navigate(to: string): void {
  window.history.pushState(null, "", to);
  window.dispatchEvent(new Event("popstate"));
}

export function useLocation(): string {
  const [location, setLocation] = useState(
    () => window.location.pathname + window.location.search,
  );
  useEffect(() => {
    const onChange = () =>
      setLocation(window.location.pathname + window.location.search);
    window.addEventListener("popstate", onChange);
    return () => window.removeEventListener("popstate", onChange);
  }, []);
  return location;
}

export function Link({
  to,
  className,
  children,
  onClick,
}: {
  to: string;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }
    event.preventDefault();
    onClick?.();
    navigate(to);
  };
  return (
    <a href={to} className={className} onClick={handleClick}>
      {children}
    </a>
  );
}
