import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type Route = {
  path: string;
  search: string;
  navigate: (to: string, options?: { replace?: boolean }) => void;
};

const RouterContext = createContext<Route | null>(null);

function currentLocation() {
  return window.location.pathname + window.location.search;
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState(currentLocation);

  useEffect(() => {
    const onChange = () => setLocation(currentLocation());
    window.addEventListener("popstate", onChange);
    return () => window.removeEventListener("popstate", onChange);
  }, []);

  const navigate = useCallback((to: string, options?: { replace?: boolean }) => {
    if (options?.replace) window.history.replaceState(null, "", to);
    else window.history.pushState(null, "", to);
    setLocation(to);
    if (!options?.replace) window.scrollTo(0, 0);
  }, []);

  const queryIndex = location.indexOf("?");
  const path = queryIndex === -1 ? location : location.slice(0, queryIndex);
  const search = queryIndex === -1 ? "" : location.slice(queryIndex);

  return (
    <RouterContext.Provider value={{ path, search, navigate }}>
      {children}
    </RouterContext.Provider>
  );
}

export function useRouter(): Route {
  const context = useContext(RouterContext);
  if (!context) throw new Error("useRouter must be used inside RouterProvider");
  return context;
}
