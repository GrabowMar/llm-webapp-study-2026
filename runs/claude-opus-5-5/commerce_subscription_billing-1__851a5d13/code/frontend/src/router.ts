import { useEffect, useState } from "react";

export function navigate(to: string, replace = false) {
  if (replace) window.history.replaceState(null, "", to);
  else window.history.pushState(null, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function useLocation() {
  const [loc, setLoc] = useState(() => ({ pathname: window.location.pathname, search: window.location.search }));
  useEffect(() => {
    const handler = () => setLoc({ pathname: window.location.pathname, search: window.location.search });
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);
  return loc;
}
