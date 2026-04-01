import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/global.css";

// Suppress Krisp noise filter auth errors (expected on self-hosted LiveKit)
window.addEventListener("unhandledrejection", (e) => {
  if (e.reason?.message?.includes("Could not authenticate")) {
    e.preventDefault();
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
