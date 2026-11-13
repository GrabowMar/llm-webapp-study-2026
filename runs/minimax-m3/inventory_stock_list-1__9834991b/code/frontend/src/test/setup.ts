const baseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:8123";
const originalFetch = globalThis.fetch;

globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const target =
    typeof input === "string"
      ? new URL(input, baseUrl).toString()
      : input instanceof URL
        ? new URL(input, baseUrl).toString()
        : input;
  return originalFetch(target as RequestInfo, init);
}) as typeof fetch;

Element.prototype.scrollIntoView = function scrollIntoView() {
  return;
};

window.scrollTo = (() => {
  return;
}) as typeof window.scrollTo;
