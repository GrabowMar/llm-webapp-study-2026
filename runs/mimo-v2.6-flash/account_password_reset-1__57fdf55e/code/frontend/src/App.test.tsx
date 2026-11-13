import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

interface FakeUser {
  id: number;
  username: string;
  password: string;
  email: string | null;
}

interface FakeMessage {
  id: number;
  to: string;
  subject: string;
  body: string;
  sent_at: string;
}

function createFakeBackend() {
  const users: FakeUser[] = [];
  const sessions = new Map<string, FakeUser>();
  const resetTokens = new Map<string, { user: FakeUser; used: boolean }>();
  const outbox: FakeMessage[] = [];
  let nextId = 1;
  let nextMessageId = 1;

  const reply = (status: number, data: unknown) => ({
    status,
    json: async () => data,
  });

  const handler = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const path = url.pathname;
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const auth = headers["Authorization"] ?? "";
    const sessionUser = auth.startsWith("Bearer ")
      ? sessions.get(auth.slice(7))
      : undefined;

    if (path === "/api/auth/register" && method === "POST") {
      if (users.some((u) => u.username === body.username)) {
        return reply(409, { error: "Username is already taken." });
      }
      if (
        body.email &&
        users.some(
          (u) => u.email?.toLowerCase() === String(body.email).toLowerCase(),
        )
      ) {
        return reply(409, { error: "Email is already in use." });
      }
      if (String(body.password ?? "").length < 8) {
        return reply(400, {
          error: "Password must be at least 8 characters long.",
        });
      }
      const user: FakeUser = {
        id: nextId++,
        username: body.username,
        password: body.password,
        email: body.email ?? null,
      };
      users.push(user);
      return reply(201, {
        id: user.id,
        username: user.username,
        email: user.email,
      });
    }

    if (path === "/api/auth/login" && method === "POST") {
      const user = users.find((u) => u.username === body.username);
      if (!user || user.password !== body.password) {
        return reply(401, { error: "Invalid username or password." });
      }
      const token = `tok-${user.id}-${nextId++}`;
      sessions.set(token, user);
      return reply(200, { token });
    }

    if (path === "/api/me" && method === "GET") {
      if (!sessionUser) return reply(401, { error: "Authentication required." });
      return reply(200, {
        id: sessionUser.id,
        username: sessionUser.username,
        email: sessionUser.email,
      });
    }

    if (path === "/api/me" && method === "PATCH") {
      if (!sessionUser) return reply(401, { error: "Authentication required." });
      sessionUser.email = body.email ?? null;
      return reply(200, {
        id: sessionUser.id,
        username: sessionUser.username,
        email: sessionUser.email,
      });
    }

    if (path === "/api/me/password" && method === "POST") {
      if (!sessionUser) return reply(401, { error: "Authentication required." });
      if (sessionUser.password !== body.current_password) {
        return reply(401, { error: "Current password is incorrect." });
      }
      if (String(body.new_password ?? "").length < 8) {
        return reply(400, {
          error: "Password must be at least 8 characters long.",
        });
      }
      sessionUser.password = body.new_password;
      return reply(200, { message: "Password updated." });
    }

    if (path === "/api/auth/password-reset" && method === "POST") {
      const identifier = String(body.username ?? body.email ?? "");
      const target = users.find(
        (u) =>
          u.username === identifier ||
          (u.email && u.email.toLowerCase() === identifier.toLowerCase()),
      );
      if (target?.email) {
        const token = `reset-${nextId++}`;
        resetTokens.set(token, { user: target, used: false });
        outbox.unshift({
          id: nextMessageId++,
          to: target.email,
          subject: "Reset your password",
          body:
            "Someone asked to reset the password for your account.\n\n" +
            `Open this link to choose a new password:\nhttp://localhost/reset?token=${token}\n\n` +
            "The link can be used once.",
          sent_at: new Date().toISOString(),
        });
      }
      return reply(200, {
        message: "If the account exists, a reset link is on its way",
      });
    }

    if (path === "/api/auth/password-reset/confirm" && method === "POST") {
      const record = resetTokens.get(body.token);
      if (!record || record.used) {
        return reply(400, {
          error: "Reset link is invalid or has already been used.",
        });
      }
      if (String(body.new_password ?? "").length < 8) {
        return reply(400, {
          error: "Password must be at least 8 characters long.",
        });
      }
      record.user.password = body.new_password;
      record.used = true;
      return reply(200, { message: "Password has been reset." });
    }

    if (path === "/api/outbox" && method === "GET") {
      const to = (url.searchParams.get("to") ?? "").toLowerCase();
      return reply(200, {
        items: outbox.filter((m) => m.to.toLowerCase() === to),
      });
    }

    return reply(404, { error: "Not found." });
  };

  return {
    handler,
    users,
    outbox,
    resetTokens,
    seed(username: string, password: string, email: string | null): FakeUser {
      const user: FakeUser = { id: nextId++, username, password, email };
      users.push(user);
      return user;
    },
    issueToken(username: string): string {
      const user = users.find((u) => u.username === username)!;
      const token = `tok-${user.id}-seed`;
      sessions.set(token, user);
      return token;
    },
    requestReset(username: string): void {
      void handler("/api/auth/password-reset", {
        method: "POST",
        body: JSON.stringify({ username }),
      });
    },
  };
}

type Backend = ReturnType<typeof createFakeBackend>;

let backend: Backend;

function goTo(path: string) {
  window.history.replaceState(null, "", path);
}

async function typeIn(label: string, value: string) {
  fireEvent.change(await screen.findByLabelText(label), {
    target: { value },
  });
}

function mainArea() {
  return within(screen.getByRole("main"));
}

beforeEach(() => {
  localStorage.clear();
  goTo("/");
  backend = createFakeBackend();
  vi.stubGlobal("fetch", backend.handler as unknown as typeof fetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("registers an account and signs in", async () => {
    render(<App />);

    fireEvent.click(mainArea().getByRole("link", { name: "Register" }));
    await typeIn("Username", "alice");
    await typeIn("Password", "password1");
    await typeIn("Email (optional)", "alice@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    await screen.findByText("Your account was created. Sign in to continue.");

    await typeIn("Username", "alice");
    await typeIn("Password", "password1");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await screen.findByText("alice@example.com");
    expect(screen.getAllByText("alice").length).toBeGreaterThan(0);
    expect(backend.users).toHaveLength(1);
  });

  it("rejects a wrong password with an error message", async () => {
    backend.seed("alice", "password1", null);
    render(<App />);

    fireEvent.click(mainArea().getByRole("link", { name: "Sign in" }));
    await typeIn("Username", "alice");
    await typeIn("Password", "wrongpass");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await screen.findByText("Invalid username or password.");
  });

  it("edits the email and changes the password on the account page", async () => {
    backend.seed("alice", "password1", "alice@example.com");
    localStorage.setItem("auth_token", backend.issueToken("alice"));
    goTo("/account");
    render(<App />);

    await screen.findByText("alice@example.com");

    await typeIn("Email", "new@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Save email" }));
    await screen.findByText("Email updated.");
    expect(backend.users[0].email).toBe("new@example.com");

    await typeIn("Current password", "password1");
    await typeIn("New password", "brandnew1");
    await typeIn("Repeat new password", "brandnew1");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    await screen.findByText("Password changed.");
    expect(backend.users[0].password).toBe("brandnew1");
  });

  it("asks for the current password before changing it", async () => {
    backend.seed("alice", "password1", null);
    localStorage.setItem("auth_token", backend.issueToken("alice"));
    goTo("/account");
    render(<App />);

    await typeIn("Current password", "nope-nope");
    await typeIn("New password", "brandnew1");
    await typeIn("Repeat new password", "brandnew1");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    await screen.findByText("Current password is incorrect.");
    expect(backend.users[0].password).toBe("password1");
  });

  it("always answers with the generic forgot-password message", async () => {
    backend.seed("alice", "password1", "alice@example.com");
    render(<App />);

    fireEvent.click(screen.getByRole("link", { name: "Forgot password?" }));
    await typeIn("Username or email", "ghost");
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    await screen.findByText(
      "If the account exists, a reset link is on its way",
    );
    expect(backend.outbox).toHaveLength(0);

    await typeIn("Username or email", "alice@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    await waitFor(() => expect(backend.outbox).toHaveLength(1));
    expect(
      screen.getAllByText("If the account exists, a reset link is on its way")
        .length,
    ).toBeGreaterThan(0);
  });

  it("shows outbox messages for an address in the mailbox", async () => {
    backend.seed("alice", "password1", "alice@example.com");
    backend.requestReset("alice");
    render(<App />);

    fireEvent.click(screen.getByRole("link", { name: "Mailbox" }));
    await typeIn("Read messages for", "alice@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Load messages" }));

    await screen.findByText("Reset your password");
    expect(screen.getByText(/token=/)).toBeTruthy();
    expect(screen.getByText("To: alice@example.com")).toBeTruthy();
  });

  it("resets a password from the link on the reset page", async () => {
    backend.seed("alice", "password1", "alice@example.com");
    backend.requestReset("alice");
    const token = [...backend.resetTokens.keys()][0];

    goTo(`/reset?token=${token}`);
    render(<App />);

    await typeIn("New password", "resetpass1");
    await typeIn("Repeat new password", "resetpass1");
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));

    await screen.findByText("Your password has been updated.");
    expect(backend.users[0].password).toBe("resetpass1");

    fireEvent.click(mainArea().getByRole("link", { name: "Sign in" }));
    await typeIn("Username", "alice");
    await typeIn("Password", "resetpass1");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("alice@example.com");
  });

  it("warns when the reset link has no token", async () => {
    goTo("/reset");
    render(<App />);

    await screen.findByText(/missing its token/);
  });

  it("requires a password of at least eight characters", async () => {
    render(<App />);

    fireEvent.click(mainArea().getByRole("link", { name: "Register" }));
    await typeIn("Username", "alice");
    await typeIn("Password", "short");
    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    await screen.findByText("Password must be at least 8 characters long.");
    expect(backend.users).toHaveLength(0);
  });

  it("signs out from the header", async () => {
    backend.seed("alice", "password1", null);
    localStorage.setItem("auth_token", backend.issueToken("alice"));
    goTo("/account");
    render(<App />);

    await screen.findByText("Not set");
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await screen.findByRole("button", { name: "Sign in" });
    expect(localStorage.getItem("auth_token")).toBeNull();
  });
});
