export type Route =
  | { name: "list" }
  | { name: "book"; id: number }
  | { name: "add" }
  | { name: "edit"; id: number }
  | { name: "login" }
  | { name: "register" };

export interface Auth {
  username: string;
}
