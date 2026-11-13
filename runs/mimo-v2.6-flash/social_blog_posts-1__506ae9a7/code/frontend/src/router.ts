export type Route =
  | { name: "list" }
  | { name: "post"; id: number }
  | { name: "write" }
  | { name: "edit"; id: number }
  | { name: "login" }
  | { name: "register" };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, "");
  const parts = path.split("/").filter(Boolean);
  const [head, second] = parts;
  if (head === "post" && second && /^\d+$/.test(second)) {
    return { name: "post", id: Number(second) };
  }
  if (head === "edit" && second && /^\d+$/.test(second)) {
    return { name: "edit", id: Number(second) };
  }
  if (head === "write") return { name: "write" };
  if (head === "login") return { name: "login" };
  if (head === "register") return { name: "register" };
  return { name: "list" };
}

export function navigate(path: string): void {
  window.location.hash = path.startsWith("#") ? path : `#${path}`;
}
