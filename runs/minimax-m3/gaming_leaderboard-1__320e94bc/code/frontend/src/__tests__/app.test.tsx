import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";

type Handler = (path: string, method: string, body: unknown) => { status: number; data: unknown };

let handler: Handler;
let requests: { path: string; method: string; body: unknown }[] = [];

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(data),
  } as unknown as Response;
}

beforeEach(() => {
  requests = [];
  localStorage.clear();
  handler = () => ({ status: 200, data: {} });
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ path, method, body });
    const result = handler(path, method, body);
    return jsonResponse(result.data, result.status);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
});

const board = {
  items: [
    { rank: 1, player: "zed", score: 900, achieved_at: "2026-01-02T10:00:00Z" },
    { rank: 2, player: "alice", score: 500, achieved_at: "2026-01-02T11:00:00Z" },
  ],
  total: 2,
};

describe("leaderboard app", () => {
  it("shows the leaderboard to anonymous visitors", async () => {
    handler = (path) =>
      path.startsWith("/api/leaderboard")
        ? { status: 200, data: board }
        : { status: 200, data: {} };

    render(<App />);

    expect(await screen.findByText("zed")).toBeTruthy();
    expect(screen.getByText("alice")).toBeTruthy();
    expect(screen.getByText("Sign in")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Register" })).toBeTruthy();
  });

  it("signs a player in and submits a score", async () => {
    const tokens: Record<string, string> = { alice: "alice-token" };
    handler = (path, method) => {
      if (path === "/api/auth/login" && method === "POST") {
        return { status: 200, data: { token: tokens.alice } };
      }
      if (path === "/api/auth/me") {
        return { status: 200, data: { id: 2, username: "alice", is_admin: false } };
      }
      if (path === "/api/scores" && method === "POST") {
        return {
          status: 201,
          data: {
            id: 9,
            score: 750,
            achieved_at: "2026-01-02T12:00:00Z",
            is_hidden: false,
            player: "alice",
            rank: 1,
            personal_best: true,
          },
        };
      }
      if (path === "/api/scores") {
        return {
          status: 200,
          data: {
            items: [
              {
                id: 9,
                score: 750,
                achieved_at: "2026-01-02T12:00:00Z",
                is_hidden: false,
                player: "alice",
              },
            ],
            best_score: 750,
          },
        };
      }
      if (path.startsWith("/api/leaderboard")) {
        return { status: 200, data: board };
      }
      return { status: 200, data: {} };
    };

    render(<App />);

    fireEvent.change(await screen.findByLabelText("Username"), { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("alice")).toBeTruthy();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeTruthy();

    fireEvent.change(await screen.findByLabelText("Score"), { target: { value: "750" } });
    fireEvent.click(screen.getByRole("button", { name: /save score/i }));

    expect(await screen.findByText("New personal best!")).toBeTruthy();
    expect(screen.getByText("#1")).toBeTruthy();
    expect(screen.getAllByText("750").length).toBeGreaterThan(0);

    const submit = requests.find((r) => r.method === "POST" && r.path === "/api/scores");
    expect(submit?.body).toEqual({ score: 750 });
  });

  it("switches period tabs and searches for a player", async () => {
    handler = (path) =>
      path.startsWith("/api/leaderboard")
        ? { status: 200, data: board }
        : { status: 200, data: {} };

    render(<App />);
    await screen.findByText("zed");

    fireEvent.click(screen.getByRole("button", { name: "This week" }));
    await waitFor(() => {
      const calls = requests.filter((r) => r.path.startsWith("/api/leaderboard"));
      expect(calls.some((c) => c.path.includes("period=week"))).toBe(true);
    });

    fireEvent.change(screen.getByPlaceholderText("Search player…"), {
      target: { value: "ali" },
    });
    await waitFor(() => {
      const calls = requests.filter((r) => r.path.startsWith("/api/leaderboard"));
      expect(calls.some((c) => c.path.includes("player=ali"))).toBe(true);
    });
  });

  it("lets the admin hide a score", async () => {
    handler = (path, method) => {
      if (path === "/api/auth/login") {
        return { status: 200, data: { token: "admin-token" } };
      }
      if (path === "/api/auth/me") {
        return { status: 200, data: { id: 1, username: "admin", is_admin: true } };
      }
      if (path.startsWith("/api/admin/scores") && method === "GET") {
        return {
          status: 200,
          data: {
            items: [
              {
                id: 3,
                score: 999999,
                achieved_at: "2026-01-02T12:00:00Z",
                is_hidden: false,
                player: "cheater",
              },
            ],
            total: 1,
            page: 1,
            page_size: 20,
          },
        };
      }
      if (path.startsWith("/api/admin/scores") && method === "POST") {
        return { status: 200, data: { id: 3, is_hidden: true } };
      }
      if (path.startsWith("/api/leaderboard")) {
        return { status: 200, data: board };
      }
      if (path === "/api/scores") {
        return { status: 200, data: { items: [], best_score: null } };
      }
      return { status: 200, data: {} };
    };

    render(<App />);

    fireEvent.change(await screen.findByLabelText("Username"), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText(/admin · all scores/i)).toBeTruthy();
    expect(await screen.findByText("999,999")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    await waitFor(() => {
      expect(
        requests.some((r) => r.method === "POST" && r.path === "/api/admin/scores/3/toggle"),
      ).toBe(true);
    });
  });
});
