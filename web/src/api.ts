const BASE = '/api';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) msg = Array.isArray(body.message) ? body.message.join('；') : body.message;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  materials: () => req<any[]>('/materials'),
  rundowns: () => req<any[]>('/rundowns'),
  rundown: (id: number) => req<any>(`/rundowns/${id}`),
  createDraft: (body: { name: string; broadcastDate: string; dayStartSec: number }) =>
    req<any>('/rundowns', { method: 'POST', body: JSON.stringify(body) }),
  saveSegments: (id: number, segments: any[]) =>
    req<{ segments: any[]; timeline: any[]; affectedPositions: number[] }>(
      `/rundowns/${id}/segments`, { method: 'PUT', body: JSON.stringify({ segments }) }),
  publish: (id: number) => req<any>(`/rundowns/${id}/publish`, { method: 'POST' }),
  simulate: (id: number, musicOverlapFault: boolean) =>
    req<any>(`/rundowns/${id}/simulate`, { method: 'POST', body: JSON.stringify({ musicOverlapFault }) }),
  compare: (id: number) => req<any>(`/rundowns/${id}/compare`),
  clearEvents: (id: number) => req<any>(`/rundowns/${id}/events`, { method: 'DELETE' }),
};
