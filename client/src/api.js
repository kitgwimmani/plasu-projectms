const TOKEN_KEY = 'plasu_pms_token';

export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } };

async function request(method, url, body, { raw = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(`/api${url}`, { method, headers, body: payload });
  if (raw && res.ok) return res;
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && token) { setToken(null); window.dispatchEvent(new Event('auth:expired')); }
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  get: (u) => request('GET', u),
  post: (u, b = {}) => request('POST', u, b),
  put: (u, b = {}) => request('PUT', u, b),
  del: (u) => request('DELETE', u),
  /** POST that returns a file and triggers a browser download. */
  download: async (u, b, filename) => {
    const res = await request(b ? 'POST' : 'GET', u, b, { raw: true });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || res.headers.get('content-disposition')?.match(/filename="?([^"]+)"?/)?.[1] || 'download';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
};

/** URL for file links opened directly (auth via query token). */
export const fileUrl = (u) => `/api${u}${u.includes('?') ? '&' : '?'}token=${encodeURIComponent(getToken() || '')}`;
