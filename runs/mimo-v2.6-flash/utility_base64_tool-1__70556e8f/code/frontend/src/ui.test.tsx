import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "./App";

const BASE = "http://127.0.0.1:8000";
const realFetch = globalThis.fetch;

function outputValue(): string {
  return (screen.getByLabelText("Output") as HTMLTextAreaElement).value;
}

async function registerRandomUser(): Promise<string> {
  const username = `ui-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  fireEvent.change(screen.getByLabelText("Username"), {
    target: { value: username },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "hunter2" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Register" }));
  await screen.findByText(`Signed in as`);
  expect(screen.getByText(username)).toBeTruthy();
  return username;
}

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: async () => undefined },
    configurable: true,
  });
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input);
    return realFetch(url.startsWith("http") ? url : BASE + url, init);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  cleanup();
});

describe("base64 converter UI", () => {
  it("encodes and decodes without an account", async () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Base64 Converter" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Input"), {
      target: { value: "héllo ☃" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Encode" }));
    await waitFor(() => expect(outputValue()).toBe("aMOpbGxvIOKYgw=="));
    expect(outputValue()).toBe("aMOpbGxvIOKYgw==");

    fireEvent.change(screen.getByLabelText("Input"), {
      target: { value: outputValue() },
    });
    fireEvent.click(screen.getByRole("button", { name: "Decode" }));
    await waitFor(() => expect(outputValue()).toBe("héllo ☃"));

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await screen.findByText("Copied!");
  });

  it("shows the API error for invalid input", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Input"), {
      target: { value: "!!! definitely not base64 !!!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Decode" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Invalid base64 input");
  });

  it("registers, signs out and signs back in", async () => {
    render(<App />);
    const username = await registerRandomUser();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await screen.findByRole("button", { name: "Sign in" });

    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: username },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "hunter2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText(`Signed in as`);
    expect(screen.getByText(username)).toBeTruthy();
  });

  it("saves conversions to history and deletes them", async () => {
    render(<App />);
    await registerRandomUser();

    const toggle = screen.getByRole("switch", { name: "Save to history" }) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(true);

    fireEvent.change(screen.getByLabelText("Input"), {
      target: { value: "saved via ui" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Encode" }));
    await screen.findByText("saved via ui");
    await waitFor(() => expect(screen.getByText(/1 saved conversion/)).toBeTruthy());
    expect(screen.getAllByText(/c2F2ZWQgdmlhIHVp/).length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.getByText(/0 saved conversions/)).toBeTruthy());
    expect(screen.getByText("No saved conversions yet.")).toBeTruthy();
  });

  it("rejects a bad direction with the API error", async () => {
    render(<App />);
    await registerRandomUser();
    const token = localStorage.getItem("base64.token")!;
    const response = await fetch(`${BASE}/api/conversions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ direction: "sideways", input: "x" }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("direction");
  });
});
