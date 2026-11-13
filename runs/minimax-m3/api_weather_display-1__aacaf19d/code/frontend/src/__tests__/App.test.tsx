import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";

interface StoredReport {
  id: number;
  city: string;
  country: string | null;
  temperature_c: number | null;
  condition: string | null;
  humidity: number | null;
  wind_kph: number | null;
  observed_at: string;
}

interface StoredLookup {
  id: number;
  city: string;
  found: boolean;
  looked_up_at: string;
}

const SEED: StoredReport[] = [
  {
    id: 1,
    city: "Berlin",
    country: "Germany",
    temperature_c: 18,
    condition: "Cloudy",
    humidity: 72,
    wind_kph: 15,
    observed_at: "2026-01-01T10:00:00Z",
  },
  {
    id: 2,
    city: "Kyoto",
    country: "Japan",
    temperature_c: 21,
    condition: "Partly Cloudy",
    humidity: 63,
    wind_kph: 9.5,
    observed_at: "2026-01-01T11:00:00Z",
  },
];

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  } as unknown as Response;
}

function installFakeApi() {
  let reports = SEED.map((report) => ({ ...report }));
  let lookups: StoredLookup[] = [];
  let nextReportId = 10;
  let nextLookupId = 100;
  let token: string | null = null;
  const calls: string[] = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push(`${method} ${url}`);

    if (url.startsWith("/api/auth/register")) {
      if (!body?.username || !body?.password) {
        return jsonResponse(
          { error: "username is required", errors: { username: "username is required" } },
          400,
        );
      }
      token = "fake-token";
      return jsonResponse({ id: 1, username: body.username }, 201);
    }

    if (url.startsWith("/api/auth/login")) {
      if (body?.username !== "demo" || body?.password !== "secret123") {
        return jsonResponse({ error: "invalid username or password" }, 401);
      }
      token = "fake-token";
      return jsonResponse({ token, username: body.username }, 200);
    }

    if (url.startsWith("/api/auth/logout")) {
      token = null;
      return jsonResponse({ ok: true });
    }

    if (url.startsWith("/api/auth/me")) {
      if (!token) return jsonResponse({ error: "invalid or expired token" }, 401);
      return jsonResponse({ id: 1, username: "demo" });
    }

    if (url.startsWith("/api/weather/recent")) {
      return jsonResponse({ items: lookups.slice(0, 5) });
    }

    if (url.startsWith("/api/weather")) {
      const parsed = new URL(url, "http://localhost");
      const city = parsed.searchParams.get("city");

      if (method === "GET" && city !== null) {
        const matches = reports.filter(
          (report) => report.city.toLowerCase() === city.trim().toLowerCase(),
        );
        lookups = [
          {
            id: nextLookupId++,
            city: city.trim(),
            found: matches.length > 0,
            looked_up_at: new Date().toISOString(),
          },
          ...lookups,
        ];
        return jsonResponse({
          items: matches,
          total: matches.length,
          page: 1,
          page_size: 20,
        });
      }

      if (method === "GET") {
        return jsonResponse({
          items: reports,
          total: reports.length,
          page: 1,
          page_size: 20,
        });
      }

      if (method === "POST" || method === "PUT") {
        const missingCity = !body?.city || !String(body.city).trim();
        const badTemperature =
          body?.temperature_c !== undefined && typeof body.temperature_c !== "number";
        if (missingCity || badTemperature) {
          const errors: Record<string, string> = {};
          if (missingCity) errors.city = "city is required";
          if (badTemperature) errors.temperature_c = "temperature_c must be a number";
          return jsonResponse(
            { error: Object.values(errors)[0], errors },
            400,
          );
        }
        const clash = reports.find(
          (report) =>
            report.city.toLowerCase() === String(body.city).trim().toLowerCase() &&
            report.id !== body.id,
        );
        if (clash) {
          return jsonResponse(
            { error: `a report for ${body.city} already exists`, errors: { city: "duplicate" } },
            409,
          );
        }
        const cleaned = {
          city: String(body.city).trim(),
          country: body.country ?? null,
          temperature_c: body.temperature_c ?? null,
          condition: body.condition ?? null,
          humidity: body.humidity ?? null,
          wind_kph: body.wind_kph ?? null,
        };
        if (method === "POST") {
          const created: StoredReport = {
            id: nextReportId++,
            ...cleaned,
            observed_at: new Date().toISOString(),
          };
          reports = [...reports, created];
          return jsonResponse(created, 201);
        }
        const index = reports.findIndex((report) => report.id === body.id);
        const updated: StoredReport = {
          ...reports[index],
          ...cleaned,
          observed_at: new Date().toISOString(),
        };
        reports = reports.map((report) => (report.id === body.id ? updated : report));
        return jsonResponse(updated);
      }

      if (method === "DELETE") {
        const id = Number(url.split("/").pop());
        const exists = reports.some((report) => report.id === id);
        if (!exists) return jsonResponse({ error: "no weather report with that id" }, 404);
        reports = reports.filter((report) => report.id !== id);
        return jsonResponse({ deleted: true, id });
      }
    }

    return jsonResponse({ error: "not found" }, 404);
  });

  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

describe("weather display", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a weather card for a city that has data", async () => {
    installFakeApi();
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("Search city"), "Berlin");
    await user.click(screen.getByRole("button", { name: "Search" }));

    const card = await screen.findByTestId("weather-card");
    expect(within(card).getByTestId("weather-city")).toHaveTextContent("Berlin");
    expect(within(card).getByTestId("weather-temperature")).toHaveTextContent("18.0°C");
    expect(within(card).getByTestId("weather-humidity")).toHaveTextContent("72%");
    expect(within(card).getByTestId("weather-wind")).toHaveTextContent("15 km/h");
    expect(within(card).getByTestId("weather-observed")).not.toBeEmptyDOMElement();
  });

  it("converts the temperature when the unit switch is flipped", async () => {
    installFakeApi();
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("Search city"), "Berlin");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByTestId("weather-card");

    await user.click(screen.getByRole("button", { name: "°F" }));

    expect(screen.getByTestId("weather-temperature")).toHaveTextContent("64.4°F");
  });

  it("shows a message when a city has no data", async () => {
    installFakeApi();
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("Search city"), "Atlantis");
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByTestId("no-weather-data")).toHaveTextContent(
      "No weather data for Atlantis",
    );
  });

  it("lists recent lookups and repeats the search when one is clicked", async () => {
    const api = installFakeApi();
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("Search city"), "Kyoto");
    await user.click(screen.getByRole("button", { name: "Search" }));

    const recent = await screen.findByTestId("recent-lookups");
    expect(within(recent).getByText("Kyoto")).toBeInTheDocument();

    const before = api.calls.filter((call) => call.includes("city=Kyoto")).length;
    await user.click(within(recent).getByText("Kyoto"));
    await waitFor(() => {
      const after = api.calls.filter((call) => call.includes("city=Kyoto")).length;
      expect(after).toBeGreaterThan(before);
    });
  });

  it("registers a user, shows the username and signs out again", async () => {
    installFakeApi();
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("tab", { name: "Register" }));
    await user.type(screen.getByLabelText("Username"), "demo");
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByTestId("signed-in-user")).toHaveTextContent("Signed in as demo");

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => {
      expect(screen.queryByTestId("signed-in-user")).not.toBeInTheDocument();
    });
  });

  it("adds a report and shows the validation message from the api", async () => {
    installFakeApi();
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("tab", { name: "Register" }));
    await user.type(screen.getByLabelText("Username"), "demo");
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await screen.findByTestId("signed-in-user");

    await user.click(screen.getByRole("button", { name: "Add report" }));
    expect((await screen.findAllByText("city is required")).length).toBeGreaterThan(0);

    await user.type(screen.getByLabelText("City"), "Oslo");
    await user.type(screen.getByLabelText("Country"), "Norway");
    await user.type(screen.getByLabelText("Temperature (°C)"), "5.2");
    await user.click(screen.getByRole("button", { name: "Add report" }));

    expect(await screen.findByText("Added a report for Oslo.")).toBeInTheDocument();
    expect(await screen.findByText("Oslo")).toBeInTheDocument();
  });

  it("deletes a report once the confirmation is accepted", async () => {
    installFakeApi();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("tab", { name: "Register" }));
    await user.type(screen.getByLabelText("Username"), "demo");
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await screen.findByTestId("signed-in-user");

    const list = await screen.findByTestId("report-list");
    expect(within(list).getByText("Berlin")).toBeInTheDocument();

    await user.click(within(list).getAllByRole("button", { name: "Delete" })[0]);

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(within(screen.getByTestId("report-list")).queryByText("Berlin")).not.toBeInTheDocument();
    });
  });
});
