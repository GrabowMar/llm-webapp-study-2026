import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";

interface StoredConversion {
  id: number;
  user_id: number;
  direction: "encode" | "decode";
  input: string;
  output: string;
  created_at: string;
}

const users = new Map<string, { id: number; password: string }>();
const tokens = new Map<string, number>();
const conversions: StoredConversion[] = [];
let nextId = 1;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function currentUser(request: Request): number | null {
  const header = request.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "");
  return tokens.get(token) ?? null;
}

function mockFetch(input: RequestInfo | URL, init?: RequestInit) {
  const request = new Request(input as RequestInfo, init);
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (path === "/api/base64/encode" && method === "POST") {
    return request.json().then((body: { text: string }) =>
      json({ encoded: btoa(String(body.text)) }),
    );
  }

  if (path === "/api/base64/decode" && method === "POST") {
    return request.json().then((body: { encoded: string }) => {
      try {
        return json({ text: atob(String(body.encoded)) });
      } catch {
        return json({ error: "Invalid base64 input" }, 400);
      }
    });
  }

  if (path === "/api/auth/register" && method === "POST") {
    return request.json().then((body: { username: string; password: string }) => {
      if (users.has(body.username)) {
        return json({ error: "Username is already taken" }, 409);
      }
      const id = users.size + 1;
      users.set(body.username, { id, password: body.password });
      return json({ id, username: body.username }, 201);
    });
  }

  if (path === "/api/auth/login" && method === "POST") {
    return request.json().then((body: { username: string; password: string }) => {
      const user = users.get(body.username);
      if (!user || user.password !== body.password) {
        return json({ error: "Invalid username or password" }, 401);
      }
      const token = `token-${user.id}`;
      tokens.set(token, user.id);
      return json({ token, username: body.username });
    });
  }

  if (path === "/api/auth/me") {
    const userId = currentUser(request);
    if (!userId) return json({ error: "Authentication required" }, 401);
    const name = [...users.entries()].find(([, value]) => value.id === userId)?.[0];
    return json({ id: userId, username: name });
  }

  if (path === "/api/conversions" && method === "POST") {
    const userId = currentUser(request);
    if (!userId) return json({ error: "Authentication required" }, 401);
    return request.json().then((body: { direction: "encode" | "decode"; input: string }) => {
      const output =
        body.direction === "encode"
          ? btoa(body.input)
          : (() => {
              try {
                return atob(body.input);
              } catch {
                return null;
              }
            })();
      if (output === null) return json({ error: "Invalid base64 input" }, 400);
      const row: StoredConversion = {
        id: nextId++,
        user_id: userId,
        direction: body.direction,
        input: body.input,
        output,
        created_at: new Date().toISOString(),
      };
      conversions.push(row);
      return json({
        id: row.id,
        direction: row.direction,
        input_preview: row.input,
        output_preview: row.output,
        created_at: row.created_at,
        output: row.output,
      });
    });
  }

  if (path === "/api/conversions" && method === "GET") {
    const userId = currentUser(request);
    if (!userId) return json({ error: "Authentication required" }, 401);
    const page = Number(url.searchParams.get("page") ?? "1");
    const pageSize = Number(url.searchParams.get("page_size") ?? "20");
    const mine = conversions
      .filter((row) => row.user_id === userId)
      .sort((a, b) => b.id - a.id);
    const items = mine
      .slice((page - 1) * pageSize, page * pageSize)
      .map((row) => ({
        id: row.id,
        direction: row.direction,
        input_preview: row.input,
        output_preview: row.output,
        created_at: row.created_at,
      }));
    return json({ items, total: mine.length, page, page_size: pageSize });
  }

  const deleteMatch = path.match(/^\/api\/conversions\/(\d+)$/);
  if (deleteMatch && method === "DELETE") {
    const userId = currentUser(request);
    if (!userId) return json({ error: "Authentication required" }, 401);
    const id = Number(deleteMatch[1]);
    const index = conversions.findIndex((row) => row.id === id && row.user_id === userId);
    if (index === -1) return json({ error: "Conversion not found" }, 404);
    conversions.splice(index, 1);
    return new Response(null, { status: 204 });
  }

  return json({ error: "Not found" }, 404);
}

beforeEach(() => {
  users.clear();
  tokens.clear();
  conversions.length = 0;
  nextId = 1;
  vi.stubGlobal("fetch", vi.fn(mockFetch));
});

async function signIn(user: userEvent.UserEvent, username: string, password: string) {
  await user.click(screen.getByRole("button", { name: /register/i }));
  await user.type(screen.getByLabelText("Username"), username);
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: /^register$/i }));
  await user.click(screen.getByRole("button", { name: /sign in/i }));
  await screen.findByText(username);
}

describe("base64 converter", () => {
  it("encodes and decodes text", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("Input"), "hello");
    await user.click(screen.getByRole("button", { name: "Encode" }));

    const output = screen.getByLabelText("Output") as HTMLTextAreaElement;
    await waitFor(() => expect(output.value).toBe("aGVsbG8="));

    await user.clear(screen.getByLabelText("Input"));
    await user.type(screen.getByLabelText("Input"), "aGVsbG8=");
    await user.click(screen.getByRole("button", { name: "Decode" }));
    await waitFor(() => expect(output.value).toBe("hello"));
  });

  it("shows the api error message for invalid input", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("Input"), "not base64!");
    await user.click(screen.getByRole("button", { name: "Decode" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Invalid base64 input");
  });

  it("exposes unambiguous labels for the account form", () => {
    render(<App />);
    expect(screen.getAllByLabelText("Username")).toHaveLength(1);
    expect(screen.getAllByLabelText("Password")).toHaveLength(1);
    expect(screen.getAllByLabelText("Input")).toHaveLength(1);
    expect(screen.getAllByLabelText("Output")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Encode" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Decode" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Copy" })).toHaveLength(1);
  });

  it("registers, signs in and shows the username", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Register" }));
    await user.type(screen.getByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Password"), "s3cret");
    await user.click(screen.getByRole("button", { name: "Register" }));

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("alice")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("saves, lists, pages and deletes history", async () => {
    const user = userEvent.setup();
    render(<App />);
    await signIn(user, "bob", "hunter22");

    const saveSwitch = screen.getByRole("switch", { name: "Save to history" });
    await user.click(saveSwitch);
    expect(saveSwitch).toBeChecked();

    for (const word of ["one", "two", "three"]) {
      await user.clear(screen.getByLabelText("Input"));
      await user.type(screen.getByLabelText("Input"), word);
      await user.click(screen.getByRole("button", { name: "Encode" }));
    }

    await waitFor(() =>
      expect(screen.getAllByTestId("history-item")).toHaveLength(3),
    );

    const items = screen.getAllByTestId("history-item");
    expect(items[0]).toHaveTextContent("three");

    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(screen.getByText(/Page 2 of/)).toBeInTheDocument(),
    );

    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    await user.click(deleteButtons[0]);
    await waitFor(() =>
      expect(screen.getAllByTestId("history-item")).toHaveLength(2),
    );
  });
});
