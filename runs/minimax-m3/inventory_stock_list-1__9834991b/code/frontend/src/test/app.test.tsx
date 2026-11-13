import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import App from "../App";

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

async function register(username: string, password = "secret123") {
  const user = userEvent.setup();
  render(<App />);
  const form = await screen.findByRole("form", { name: "Register" });
  await user.type(within(form).getByLabelText("New username"), username);
  await user.type(within(form).getByLabelText("New password"), password);
  await user.click(within(form).getByRole("button", { name: "Register" }));
  await screen.findByText(username);
  return user;
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("inventory app", () => {
  it("shows the inventory to anonymous visitors", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Inventory" })).toBeTruthy();
    expect(screen.getByRole("form", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByRole("form", { name: "Register" })).toBeTruthy();
  });

  it("registers an account and signs the user in", async () => {
    const username = unique("user");
    await register(username);
    expect(screen.getByText(username)).toBeTruthy();
    expect(screen.queryByRole("form", { name: "Register" })).toBeNull();
  });

  it("signs in again after a reload", async () => {
    const username = unique("user");
    await register(username);

    cleanup();
    render(<App />);
    expect(await screen.findByText(username)).toBeTruthy();
  });

  it("adds an item and rejects a duplicate sku", async () => {
    const user = await register(unique("user"));
    const sku = unique("SKU");

    await user.click(screen.getByRole("button", { name: "Add item" }));
    let dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "Widget");
    await user.type(within(dialog).getByLabelText("SKU"), sku);
    await user.type(within(dialog).getByLabelText("Location"), "Aisle 1");
    await user.click(within(dialog).getByRole("button", { name: "Create item" }));

    expect(await screen.findByRole("link", { name: "Widget" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Add item" }));
    dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "Widget copy");
    await user.type(within(dialog).getByLabelText("SKU"), sku);
    await user.click(within(dialog).getByRole("button", { name: "Create item" }));

    expect((await screen.findAllByText(/already exists/i)).length).toBeGreaterThan(0);
  });

  it("flags low stock items and filters them", async () => {
    const user = await register(unique("user"));
    const lowName = unique("Low");
    const highName = unique("High");

    await user.click(screen.getByRole("button", { name: "Add item" }));
    let dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), lowName);
    await user.type(within(dialog).getByLabelText("SKU"), unique("SKU"));
    await user.type(within(dialog).getByLabelText("Location"), "Aisle 9");
    await user.clear(within(dialog).getByLabelText("Opening quantity"));
    await user.type(within(dialog).getByLabelText("Opening quantity"), "1");
    await user.clear(within(dialog).getByLabelText("Reorder level"));
    await user.type(within(dialog).getByLabelText("Reorder level"), "5");
    await user.click(within(dialog).getByRole("button", { name: "Create item" }));
    expect(await screen.findByRole("link", { name: lowName })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Add item" }));
    dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), highName);
    await user.type(within(dialog).getByLabelText("SKU"), unique("SKU"));
    await user.clear(within(dialog).getByLabelText("Opening quantity"));
    await user.type(within(dialog).getByLabelText("Opening quantity"), "50");
    await user.click(within(dialog).getByRole("button", { name: "Create item" }));
    expect(await screen.findByRole("link", { name: highName })).toBeTruthy();

    const lowSwitch = screen.getByRole("switch", { name: /low stock only/i });
    expect(lowSwitch.getAttribute("aria-checked")).toBe("false");
    await user.click(lowSwitch);

    await waitFor(() => {
      expect(screen.queryByRole("link", { name: highName })).toBeNull();
    });
    expect(screen.getByRole("link", { name: lowName })).toBeTruthy();
  });

  it("records movements on the item page", async () => {
    const user = await register(unique("user"));
    const name = unique("Widget");

    await user.click(screen.getByRole("button", { name: "Add item" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), name);
    await user.type(within(dialog).getByLabelText("SKU"), unique("SKU"));
    await user.clear(within(dialog).getByLabelText("Opening quantity"));
    await user.type(within(dialog).getByLabelText("Opening quantity"), "5");
    await user.click(within(dialog).getByRole("button", { name: "Create item" }));

    await user.click(await screen.findByRole("link", { name }));
    expect(await screen.findByRole("heading", { name })).toBeTruthy();
    expect(screen.getByTestId("item-quantity").textContent).toBe("5");

    const receive = screen.getByRole("form", { name: "Receive" });
    await user.type(within(receive).getByLabelText("Amount"), "7");
    await user.type(within(receive).getByLabelText("Reason"), "delivery");
    await user.click(within(receive).getByRole("button", { name: "Receive stock" }));

    await waitFor(() => {
      expect(screen.getByTestId("item-quantity").textContent).toBe("12");
    });
    expect(screen.getByText("delivery")).toBeTruthy();
    expect(screen.getByText("+7")).toBeTruthy();

    const take = screen.getByRole("form", { name: "Take out" });
    await user.type(within(take).getByLabelText("Amount"), "20");
    await user.click(within(take).getByRole("button", { name: "Take out stock" }));

    expect(await screen.findByText(/only 12 units in stock/i)).toBeTruthy();
    expect(screen.getByTestId("item-quantity").textContent).toBe("12");

    await user.clear(within(take).getByLabelText("Amount"));
    await user.type(within(take).getByLabelText("Amount"), "2");
    await user.click(within(take).getByRole("button", { name: "Take out stock" }));

    await waitFor(() => {
      expect(screen.getByTestId("item-quantity").textContent).toBe("10");
    });
  });

  it("deletes an item after confirmation", async () => {
    const user = await register(unique("user"));
    const name = unique("Widget");

    await user.click(screen.getByRole("button", { name: "Add item" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), name);
    await user.type(within(dialog).getByLabelText("SKU"), unique("SKU"));
    await user.click(within(dialog).getByRole("button", { name: "Create item" }));

    await user.click(await screen.findByRole("link", { name }));
    await screen.findByRole("heading", { name });
    await user.click(screen.getByRole("button", { name: "Delete item" }));

    const confirm = await screen.findByRole("dialog");
    expect(within(confirm).getByText(/cannot be undone/i)).toBeTruthy();
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.queryByRole("link", { name })).toBeNull();
    });
    expect(await screen.findByRole("heading", { name: "Inventory" })).toBeTruthy();
  });

  it("signs the user out", async () => {
    const user = await register(unique("user"));
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("form", { name: "Sign in" })).toBeTruthy();
  });
});
