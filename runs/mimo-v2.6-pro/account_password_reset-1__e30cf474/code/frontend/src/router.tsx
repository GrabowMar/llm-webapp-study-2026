import { useEffect, useState } from "react";

export type Location = {
  path: string;
  search: string;
};

function currentLocation(): Location {
  return {
    path: window.location.pathname,
    search: window.location.search,
  };
}

export function navigate(to: string): void {
  window.history.pushState({}, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function useLocation(): Location {
  const [location, setLocation] = useState<Location>(currentLocation);

  useEffect(() => {
    const onPopState = () => setLocation(currentLocation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return location;
}
