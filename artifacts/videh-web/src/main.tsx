import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initWebTheme } from "./lib/webTheme";

initWebTheme();

createRoot(document.getElementById("root")!).render(<App />);
