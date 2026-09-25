const pad = (n: number) => String(n).padStart(2, '0');

/** ISO → 本地 HH:MM:SS */
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** ISO → <input type="time" step=1> 需要的 HH:MM:SS */
export function toTimeInput(iso: string): string {
  return fmtTime(iso);
}

/** 播出日 + HH:MM:SS → ISO（本地时区） */
export function fromTimeInput(dateStr: string, time: string): string {
  return new Date(`${dateStr}T${time}`).toISOString();
}

/** 秒 → 8'05" / 52'00" */
export function fmtDur(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return '—';
  const sign = sec < 0 ? '-' : '';
  const abs = Math.abs(Math.round(sec));
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${sign}${m}′${pad(s)}″`;
}

/** 偏差：+35s / -10s / 准点 */
export function fmtDelta(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return '—';
  if (sec === 0) return '准点';
  return sec > 0 ? `+${sec}s` : `${sec}s`;
}

export const TYPE_LABEL: Record<string, string> = {
  news: '新闻',
  music: '音乐',
  ident: '台标',
  program: '节目',
  weather: '天气',
  ad: '广告',
};
