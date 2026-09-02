const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";
const SESSION_KEY = "ar_session_v1";

export const getSession = () => {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
};

export const saveSession = (session) => localStorage.setItem(SESSION_KEY, JSON.stringify(session));

export const clearSession = () => {
  Object.keys(localStorage).filter((key) => key.startsWith("ar_")).forEach((key) => localStorage.removeItem(key));
};

export async function api(path, { method = "GET", body, token } = {}) {
  const session = getSession();
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token || session?.token ? { Authorization: `Bearer ${token || session.token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }).catch(() => {
    throw new Error("Cannot reach the backend. Start it with npm run dev in the backend folder.");
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "The request could not be completed.");
  return payload;
}

export const dataItems = (payload) => payload?.data?.items || [];
export const formatDate = (value) => value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value)) : "—";
export const initials = (value = "User") => value.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
