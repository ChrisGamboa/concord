/** Central server configuration. Set VITE_SERVER_URL at build time for production. */
const SERVER_URL = (import.meta as any).env?.VITE_SERVER_URL || "http://localhost:3001";
const WS_URL = (import.meta as any).env?.VITE_WS_URL || SERVER_URL.replace(/^http/, "ws");
const API_URL = `${SERVER_URL}/api`;

export { SERVER_URL, WS_URL, API_URL };
