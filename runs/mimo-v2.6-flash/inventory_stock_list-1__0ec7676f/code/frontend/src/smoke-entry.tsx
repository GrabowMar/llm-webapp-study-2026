import { createRoot } from "react-dom/client";
import App from "./App";

export function mount(container: Element): void {
  createRoot(container).render(<App />);
}
