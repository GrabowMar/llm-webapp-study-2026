import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

function currentPath() {
  return window.location.pathname;
}

function parse(path: string): { name: string; params: Record<string, string> } {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return { name: "home", params: {} };
  const [head, ...rest] = parts;
  if (head === "posts") {
    if (rest.length === 0) return { name: "home", params: {} };
    if (rest.length === 1) return { name: "post", params: { id: rest[0] } };
    if (rest.length === 2 && rest[1] === "edit")
      return { name: "edit", params: { id: rest[0] } };
  }
  if (head === "new" && rest.length === 0) return { name: "new", params: {} };
  if (head === "login" && rest.length === 0) return { name: "login", params: {} };
  if (head === "register" && rest.length === 0)
    return { name: "register", params: {} };
  return { name: "notfound", params: {} };
}

type Route = { name: string; params: Record<string, string> };

const RouterContext = createContext<Route>({ name: "home", params: {} });

export function navigate(to: string) {
  window.history.pushState({}, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(() => parse(currentPath()));

  useEffect(() => {
    const onPop = () => setRoute(parse(currentPath()));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return (
    <RouterContext.Provider value={route}>{children}</RouterContext.Provider>
  );
}

export function useRoute() {
  return useContext(RouterContext);
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
  return (
    <a
      href={to}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
