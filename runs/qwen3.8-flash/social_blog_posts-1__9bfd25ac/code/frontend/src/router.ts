import { useEffect, useState } from "react";

function currentPath(): string {
  const hash = window.location.hash;
  if (hash.startsWith("#/")) return hash.slice(1);
  return "/";
}

export function useRoute(): [string, (to: string) => void] {
  const [path, setPath] = useState<string>(currentPath());

  useEffect(() => {
    const onChange = () => setPath(currentPath());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const navigate = (to: string) => {
    if (currentPath() === to) {
      setPath(to);
      return;
    }
    window.location.hash = to;
  };

  return [path, navigate];
}

export function navigate(to: string): void {
  window.location.hash = to;
}

export function parseRoute(path: string): { name: string; param: string } {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return { name: "list", param: "" };
  if (parts[0] === "new") return { name: "new", param: "" };
  if (parts[0] === "login") return { name: "login", param: "" };
  if (parts[0] === "posts" && parts[1]) {
    if (parts[2] === "edit") return { name: "edit", param: parts[1] };
    return { name: "post", param: parts[1] };
  }
  return { name: "list", param: "" };
}
