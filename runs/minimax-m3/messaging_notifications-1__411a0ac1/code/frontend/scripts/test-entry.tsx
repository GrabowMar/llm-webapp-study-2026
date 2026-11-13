import { createRoot } from "react-dom/client";
import App from "../src/App";

export function mount(container: HTMLElement) {
  createRoot(container).render(<App />);
}
