export const API = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");

export function signalingURL() {
  const url = new URL(`${API}/messaging/ws`, window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
