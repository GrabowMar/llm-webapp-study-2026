import { useEffect, useState } from "react";

export function navigate(to: string, replace = false) {
  if (to === window.location.pathname + window.location.search) return;
  if (replace) window.history.replaceState(null, "", to);
  else window.history.pushState(null, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
}

export function useLocation() {
  const read = () => ({ pathname: window.location.pathname, search: window.location.search });
  const [loc, setLoc] = useState(read);
  useEffect(() => {
    const update = () => setLoc(read());
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  return loc;
}

export type Route =
  | { name: "list" }
  | { name: "new" }
  | { name: "detail"; id: number }
  | { name: "edit"; id: number }
  | { name: "notFound" };

export function matchRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/" || path === "/customers") return { name: "list" };
  if (path === "/customers/new") return { name: "new" };
  let m = path.match(/^\/customers\/(\d+)$/);
  if (m) return { name: "detail", id: Number(m[1]) };
  m = path.match(/^\/customers\/(\d+)\/edit$/);
  if (m) return { name: "edit", id: Number(m[1]) };
  return { name: "notFound" };
}
