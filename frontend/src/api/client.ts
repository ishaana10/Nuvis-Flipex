export class ApiError extends Error {
  constructor(message: string, public status: number, public fields: Record<string, string> = {}) {
    super(message);
  }
}

let accessToken: string | null = null;
let onAuthLost: () => void = () => {};

export const setAccessToken = (t: string | null) => { accessToken = t; };
export const getAccessToken = () => accessToken;
export const setAuthLostHandler = (fn: () => void) => { onAuthLost = fn; };

async function raw(path: string, method: string, body?: unknown, auth = true): Promise<Response> {
  const headers: Record<string, string> = { 'X-Requested-With': 'XMLHttpRequest' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return fetch(`/api/v1${path}`, {
    method, headers, credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

let refreshing: Promise<boolean> | null = null;
export function refreshSession(): Promise<{ accessToken: string; user: unknown } | null> {
  return (refreshing ??= raw('/auth/refresh', 'POST', undefined, false)
    .then(async (r) => {
      if (!r.ok) return null;
      const data = await r.json();
      accessToken = data.accessToken;
      return data;
    })
    .finally(() => { refreshing = null; })) as Promise<any>;
}

export async function api<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let res = await raw(path, method, body);
  if (res.status === 401 && !path.startsWith('/auth/')) {
    if (await refreshSession()) res = await raw(path, method, body);
    else { onAuthLost(); }
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? 'Request failed', res.status, data.fields ?? {});
  return data as T;
}

export async function uploadForm<T = any>(path: string, fd: FormData): Promise<T> {
  const send = () =>
    fetch(`/api/v1${path}`, {
      method: 'POST',
      body: fd,
      credentials: 'include',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });
  let r = await send();
  if (r.status === 401 && (await refreshSession())) r = await send();
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(data.error ?? 'Upload failed', r.status, data.fields ?? {});
  return data as T;
}
