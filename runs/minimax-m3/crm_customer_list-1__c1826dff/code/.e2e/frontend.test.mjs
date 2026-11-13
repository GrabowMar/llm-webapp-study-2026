import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";

const DIST = "/workspace/frontend/dist";
const failures = [];
let checks = 0;

function check(label, condition, detail = "") {
  checks += 1;
  if (condition) console.log(`  ok   ${label}`);
  else {
    console.log(`  FAIL ${label} :: ${detail}`);
    failures.push(label);
  }
}

function nowIso() {
  return new Date().toISOString().replace("Z", "Z");
}

const customers = new Map();
const interactions = new Map();
let nextCustomerId = 1;
let nextInteractionId = 1;
const users = { alex: "secret123" };

function seed() {
  const id = nextCustomerId++;
  customers.set(id, {
    id,
    name: "Acme Contact",
    email: "contact@acme.com",
    phone: "555-0100",
    company: "Acme",
    notes: "Key account",
    created_at: "2026-01-02T09:00:00.000000Z",
    updated_at: "2026-01-02T09:00:00.000000Z",
  });
  const second = nextCustomerId++;
  customers.set(second, {
    id: second,
    name: "Bob Contact",
    email: "bob@globex.com",
    phone: "555-0199",
    company: "Globex",
    notes: "",
    created_at: "2026-01-03T09:00:00.000000Z",
    updated_at: "2026-01-03T09:00:00.000000Z",
  });
}

function serialize(customer) {
  const logs = (interactions.get(customer.id) ?? []).map((entry) => entry);
  const last = logs.length ? logs[0].occurred_at : null;
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    company: customer.company,
    notes: customer.notes,
    created_at: customer.created_at,
    interaction_count: logs.length,
    last_contacted_at: last,
  };
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

async function handleFetch(url, init = {}) {
  const method = (init.method ?? "GET").toUpperCase();
  const path = url.split("?")[0];
  const query = new URL(url, "http://localhost").searchParams;
  const rawHeaders = init.headers ?? {};
  const headers =
    typeof rawHeaders.entries === "function"
      ? Object.fromEntries(rawHeaders.entries())
      : { ...rawHeaders };
  const auth = headers.Authorization ?? headers.authorization ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  const body = init.body ? JSON.parse(init.body) : {};

  if (path === "/api/auth/login") {
    if (!users[body.username] || users[body.username] !== body.password) {
      return jsonResponse(401, { error: "Invalid username or password." });
    }
    return jsonResponse(200, { token: "test-token" });
  }
  if (path === "/api/auth/register") {
    if (users[body.username]) {
      return jsonResponse(400, { error: "Please fix the highlighted fields.", fields: { username: "That username is already taken." } });
    }
    users[body.username] = body.password;
    return jsonResponse(201, { token: "test-token", username: body.username });
  }
  if (path === "/api/auth/me") {
    if (token !== "test-token") return jsonResponse(401, { error: "Authentication required." });
    return jsonResponse(200, { id: 1, username: "alex" });
  }
  if (path === "/api/auth/logout") return jsonResponse(200, { status: "signed out" });

  if (!token) return jsonResponse(401, { error: "Authentication required." });

  if (path === "/api/companies") {
    const items = [...new Set([...customers.values()].map((c) => c.company))].sort();
    return jsonResponse(200, { items });
  }

  if (path === "/api/customers" && method === "GET") {
    let rows = [...customers.values()];
    const q = (query.get("q") ?? "").toLowerCase();
    if (q) {
      rows = rows.filter((c) =>
        [c.name, c.email, c.company, c.phone].some((v) => (v ?? "").toLowerCase().includes(q)),
      );
    }
    const company = query.get("company") ?? "";
    if (company) rows = rows.filter((c) => c.company === company);
    rows.sort((a, b) => a.name.localeCompare(b.name));
    const page = Number(query.get("page") ?? 1);
    const pageSize = Number(query.get("page_size") ?? 20);
    const start = (page - 1) * pageSize;
    return jsonResponse(200, {
      items: rows.slice(start, start + pageSize).map(serialize),
      total: rows.length,
      page,
      page_size: pageSize,
    });
  }

  if (path === "/api/customers" && method === "POST") {
    if (!body.name || !body.name.trim()) {
      return jsonResponse(400, { error: "Please fix the highlighted fields.", fields: { name: "Name is required." } });
    }
    const email = (body.email ?? "").trim();
    if (email && [...customers.values()].some((c) => (c.email ?? "").toLowerCase() === email.toLowerCase())) {
      return jsonResponse(400, {
        error: "Please fix the highlighted fields.",
        fields: { email: "A customer with this email already exists." },
      });
    }
    const id = nextCustomerId++;
    customers.set(id, {
      id,
      name: body.name.trim(),
      email: email || null,
      phone: (body.phone ?? "").trim() || null,
      company: (body.company ?? "").trim() || null,
      notes: (body.notes ?? "").trim() || null,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
    return jsonResponse(201, serialize(customers.get(id)));
  }

  const detailMatch = path.match(/^\/api\/customers\/(\d+)(\/interactions)?$/);
  if (detailMatch) {
    const id = Number(detailMatch[1]);
    const customer = customers.get(id);
    if (!customer) return jsonResponse(404, { error: "That customer does not exist." });

    if (detailMatch[2] && method === "GET") {
      return jsonResponse(200, { items: interactions.get(id) ?? [] });
    }
    if (detailMatch[2] && method === "POST") {
      if (!body.kind) {
        return jsonResponse(400, { error: "Please fix the highlighted fields.", fields: { kind: "Kind is required." } });
      }
      const entry = {
        id: nextInteractionId++,
        customer_id: id,
        kind: body.kind,
        summary: body.summary ?? "",
        occurred_at: body.occurred_at ?? nowIso(),
        logged_by: "alex",
      };
      interactions.set(id, [entry, ...(interactions.get(id) ?? [])]);
      return jsonResponse(201, entry);
    }
    if (method === "GET") return jsonResponse(200, serialize(customer));
    if (method === "PUT") {
      const email = (body.email ?? "").trim();
      if (email && [...customers.values()].some((c) => c.id !== id && (c.email ?? "").toLowerCase() === email.toLowerCase())) {
        return jsonResponse(400, {
          error: "Please fix the highlighted fields.",
          fields: { email: "A customer with this email already exists." },
        });
      }
      Object.assign(customer, {
        name: body.name,
        email: email || null,
        phone: (body.phone ?? "").trim() || null,
        company: (body.company ?? "").trim() || null,
        notes: (body.notes ?? "").trim() || null,
        updated_at: nowIso(),
      });
      return jsonResponse(200, serialize(customer));
    }
    if (method === "DELETE") {
      customers.delete(id);
      interactions.delete(id);
      return jsonResponse(200, { status: "deleted", id });
    }
  }

  return jsonResponse(404, { error: "Unknown API endpoint." });
}

async function main() {
  seed();
  const html = readFileSync(join(DIST, "index.html"), "utf8");
  const asset = html.match(/src="([^"]+\.js)"/)[1];
  const script = readFileSync(join(DIST, asset.replace(/^\//, "")), "utf8");

  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => {
    failures.push(`jsdom error: ${error.message}`);
    console.log(`  FAIL jsdom error :: ${error.message}`);
  });

  const dom = new JSDOM(html, {
    url: "http://localhost/signin",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole,
  });

  const { window } = dom;
  window.fetch = async (url, init) => handleFetch(String(url), init ?? {});
  window.eval(script);

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const text = () => window.document.body.textContent ?? "";
  const byText = (selector, needle) =>
    [...window.document.querySelectorAll(selector)].find((node) =>
      (node.textContent ?? "").includes(needle),
    );

  await wait(300);
  check("sign-in screen renders", text().includes("Customer Directory"), text().slice(0, 200));
  check("sign-in describes the directory", text().includes("One shared place"), text().slice(0, 300));
  check("registration form present", text().includes("Create account"), text().slice(0, 300));

  const usernameInput = window.document.querySelector("#username");
  const passwordInput = window.document.querySelector("#password");
  check("username field exists", Boolean(usernameInput));
  check("password field exists", Boolean(passwordInput));

  const setValue = (element, value) => {
    const proto =
      element.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(element, value);
    element.dispatchEvent(new window.Event("input", { bubbles: true }));
  };

  setValue(usernameInput, "alex");
  setValue(passwordInput, "secret123");
  const form = window.document.querySelector("form");
  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await wait(500);

  check("signed in and redirected to the list", window.location.pathname === "/customers", window.location.href);
  check("list shows customers", text().includes("Acme Contact") && text().includes("Bob Contact"), text().slice(0, 400));
  check("list shows email column", text().includes("contact@acme.com"), text().slice(0, 400));
  check("list shows phone column", text().includes("555-0100"), text().slice(0, 400));
  check("list shows company column", text().includes("Globex"), text().slice(0, 400));
  check("list shows last contacted", text().includes("Last contacted"), text().slice(0, 400));
  check("search box present", Boolean(window.document.querySelector("#search")), "missing #search");
  check("company filter present", Boolean(window.document.querySelector("#company")), "missing #company");
  check("paging present", text().includes("Previous") && text().includes("Next"), text().slice(0, 400));

  const rows = window.document.querySelectorAll("tbody tr");
  check("table has one row per customer", rows.length === 2, `rows=${rows.length}`);

  const searchInput = window.document.querySelector("#search");
  setValue(searchInput, "Globex");
  await wait(700);
  check("search filters the table", text().includes("Bob Contact") && !text().includes("Acme Contact"), text().slice(0, 400));

  setValue(searchInput, "");
  await wait(700);

  const acmeLink = byText("a", "Acme Contact");
  check("customer row links to the detail page", Boolean(acmeLink), "no link");
  acmeLink.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
  await wait(500);
  check("detail page opens", window.location.pathname.startsWith("/customers/"), window.location.href);
  check("detail shows contact details", text().includes("555-0100") && text().includes("contact@acme.com"), text().slice(0, 400));
  check("detail has edit action", text().includes("Edit"), text().slice(0, 300));
  check("detail has delete action", text().includes("Delete"), text().slice(0, 300));
  check("detail has interaction log", text().includes("Interaction log"), text().slice(0, 400));
  check("detail has log form", text().includes("Log an interaction"), text().slice(0, 400));

  const summaryBox = window.document.querySelector("#summary");
  setValue(summaryBox, "Discussed the renewal");
  const logForm = [...window.document.querySelectorAll("form")].find((f) =>
    f.querySelector("#summary"),
  );
  logForm.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await wait(600);
  check("interaction appears in the log", text().includes("Discussed the renewal"), text().slice(0, 600));
  check("interaction shows who logged it", text().includes("logged by alex"), text().slice(0, 600));
  check("interaction shows the kind", text().includes("Call"), text().slice(0, 600));

  const editLink = byText("a", "Edit");
  editLink.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
  await wait(500);
  check("edit form opens", window.location.pathname.endsWith("/edit"), window.location.href);
  const nameField = window.document.querySelector("#name");
  check("edit form is prefilled", nameField.value === "Acme Contact", nameField.value);

  setValue(nameField, "Acme Contact Renamed");
  const editForm = window.document.querySelector("form");
  editForm.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await wait(600);
  check("edit saves and returns to the detail page", text().includes("Acme Contact Renamed"), text().slice(0, 400));

  const backLink = byText("a", "Back to customers");
  check("back link present", Boolean(backLink), "missing");
  backLink.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
  await wait(500);
  check("back to the list", window.location.pathname === "/customers", window.location.href);

  const newButton = byText("a", "Add customer");
  check("add customer button present", Boolean(newButton), "missing");
  newButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
  await wait(500);
  check("add form opens", window.location.pathname === "/customers/new", window.location.href);

  const newName = window.document.querySelector("#name");
  const newEmail = window.document.querySelector("#email");
  setValue(newName, "Duplicate Co");
  setValue(newEmail, "contact@acme.com");
  const createForm = window.document.querySelector("form");
  createForm.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await wait(600);
  check(
    "duplicate email message is shown",
    text().includes("A customer with this email already exists."),
    text().slice(0, 600),
  );

  setValue(newEmail, "fresh@newco.com");
  setValue(newName, "Fresh Co");
  const createForm2 = window.document.querySelector("form");
  createForm2.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await wait(600);
  check("new customer is created", window.location.pathname.startsWith("/customers/"), window.location.href);
  check("new customer detail shows the name", text().includes("Fresh Co"), text().slice(0, 400));

  console.log(`\n${checks - failures.length}/${checks} checks passed`);
  if (failures.length) {
    console.log("failed:", failures);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
