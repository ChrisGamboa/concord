import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/global.css";

// Set titlebar height CSS variable based on platform
const platform = (window as any).electron?.platform;
if (platform === "darwin" || platform === "win32") {
  document.documentElement.style.setProperty("--titlebar-height", "36px");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
