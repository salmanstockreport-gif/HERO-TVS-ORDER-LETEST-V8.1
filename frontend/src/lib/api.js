import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const client = axios.create({
  baseURL: API,
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("hmc_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Global inventory-lock listener bus
const listeners = new Set();
export function onInventoryLock(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function emitInventoryLock(payload) {
  listeners.forEach((cb) => {
    try {
      cb(payload);
    } catch {}
  });
}

client.interceptors.response.use(
  (r) => r,
  (err) => {
    const status = err?.response?.status;
    if (status === 401) {
      const path = window.location.pathname;
      if (path !== "/login") {
        localStorage.removeItem("hmc_token");
        localStorage.removeItem("hmc_user");
        window.location.href = "/login";
      }
    } else if (status === 423) {
      // Inventory lock — broadcast to UI
      const detail = err?.response?.data?.detail;
      if (detail && detail.code === "inventory_stale") {
        emitInventoryLock(detail);
      }
    }
    return Promise.reject(err);
  },
);

export function formatApiError(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (detail && detail.code === "inventory_stale" && detail.message) return detail.message;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export default client;
