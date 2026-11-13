import { useEffect, useState } from "react";

export type Route =
  | { name: "browse" }
  | { name: "recipe"; id: number }
  | { name: "add" }
  | { name: "edit"; id: number }
  | { name: "login" }
  | { name: "register" };

export function navigate(path: string): void {
  const target = path.startsWith("#") ? path : `#${path}`;
  if (window.location.hash === target) {
    window.dispatchEvent(new Event("hashchange"));
  } else {
    window.location.hash = target;
  }
}

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#/, "").split("/").filter(Boolean);
  if (parts.length === 0) {
    return { name: "browse" };
  }
  const [head, second] = parts;
  if (head === "recipes") {
    const id = Number(second);
    if (second !== undefined && Number.isInteger(id) && id > 0) {
      return { name: "recipe", id };
    }
    return { name: "browse" };
  }
  if (head === "edit") {
    const id = Number(second);
    if (second !== undefined && Number.isInteger(id) && id > 0) {
      return { name: "edit", id };
    }
    return { name: "browse" };
  }
  if (head === "add") return { name: "add" };
  if (head === "login") return { name: "login" };
  if (head === "register") return { name: "register" };
  return { name: "browse" };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() =>
    parseRoute(window.location.hash),
  );
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
