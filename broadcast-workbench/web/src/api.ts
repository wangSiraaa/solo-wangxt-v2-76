import type {
  Board,
  Comparison,
  Material,
  ScheduleBundle,
  SimOverride,
  UpsertItem,
} from './types';

const BASE = '/api';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg = Array.isArray(body?.message) ? body.message.join('；') : body?.message;
    throw new Error(msg ?? `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export const api = {
  board: (date: string) => req<Board>(`/schedules/board?date=${date}`),
  materials: () => req<Material[]>('/materials'),
  createDraft: (scheduleId: string) =>
    req<ScheduleBundle>(`/schedules/${scheduleId}/draft`, { method: 'POST' }),
  saveDraft: (draftId: string, items: UpsertItem[]) =>
    req<ScheduleBundle>(`/schedules/${draftId}/items`, {
      method: 'PUT',
      body: JSON.stringify({ items }),
    }),
  publish: (draftId: string) =>
    req<ScheduleBundle>(`/schedules/${draftId}/publish`, { method: 'POST' }),
  comparison: (scheduleId: string) => req<Comparison>(`/schedules/${scheduleId}/comparison`),
  simulate: (scheduleId: string, overrides: SimOverride[]) =>
    req<Comparison>(`/schedules/${scheduleId}/simulate`, {
      method: 'POST',
      body: JSON.stringify({ overrides }),
    }),
  clearEvents: (scheduleId: string) =>
    req<{ deleted: number }>(`/events?scheduleId=${scheduleId}`, { method: 'DELETE' }),
};
