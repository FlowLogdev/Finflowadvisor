// Tiny API helper — uses fetch + JWT from localStorage.
// Set NEXT_PUBLIC_API_URL or REACT_APP_API_URL to your backend host (e.g. https://finflowadvisors.com)

const API_BASE =
  (typeof process !== 'undefined' &&
    (process.env.NEXT_PUBLIC_API_URL || process.env.REACT_APP_API_URL)) ||
  '';

function authHeader() {
  if (typeof window === 'undefined') return {};
  const t = window.localStorage.getItem('finflow_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function apiGet(path) {
  const r = await fetch(`${API_BASE}${path}`, {
    headers: { ...authHeader() },
    credentials: 'include',
  });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
  return r.json();
}

export async function apiPost(path, body) {
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`POST ${path} → ${r.status}`);
  return r.json();
}

export async function apiPatch(path, body) {
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`PATCH ${path} → ${r.status}`);
  return r.json();
}

export async function apiDelete(path) {
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: { ...authHeader() },
    credentials: 'include',
  });
  if (!r.ok) throw new Error(`DELETE ${path} → ${r.status}`);
  return r.json();
}

export const API_BASE_URL = API_BASE;
