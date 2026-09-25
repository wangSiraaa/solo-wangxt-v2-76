// 节目单时间账核心计算：计划时间线、素材缺口、硬整点保护、计划/实际对照。
// 前端（Vue）与服务端（NestJS）共用本模块，保证两边算的是同一本账。

export type SegmentKind = 'program' | 'music' | 'ident' | 'news';

export interface SegmentInput {
  id: number | string;
  title: string;
  kind: SegmentKind;
  plannedDurationSec: number;
  overlapNextSec: number;             // 与下一段的转场重叠秒数（音乐/台标常用）
  hardTop: boolean;                   // 硬整点：必须准点开播，不被前序拖延
  fixedStartSec: number | null;       // 硬整点固定开始（当日 0 点起秒）
  materialDurationSec: number | null; // 关联素材时长；null = 未挂素材
}

export interface SegmentTiming {
  id: number | string;
  startSec: number;
  endSec: number;
  gapSec: number;         // 素材缺口：计划时长 - 素材时长（不足部分）
  surplusSec: number;     // 素材富余：素材时长超出计划的部分
  slackBeforeSec: number; // 本段开始前的空闲（前段结束到本段开始之间的空档）
  prevOverrunSec: number; // 前序内容超时侵入本段的秒数（硬整点保护触发时 > 0）
  missingMaterial: boolean;
}

/**
 * 推算计划时间线。
 * 规则：
 *  - 普通段：开始 = 上一段结束 - 上一段设置的转场重叠；
 *  - 硬整点段：开始锚定 fixedStartSec，前序超时不顺延（prevOverrunSec 记录被切掉的量），
 *    前序不足则留下空档（slackBeforeSec）；
 *  - 素材不足计划时长时给出 gapSec 缺口。
 */
export function computeTimeline(dayStartSec: number, segments: SegmentInput[]): SegmentTiming[] {
  const result: SegmentTiming[] = [];
  let prevEnd = dayStartSec;
  let prevOverlap = 0;
  for (const seg of segments) {
    const natural = prevEnd - prevOverlap; // 按转场重叠推算的自然开始
    let start = natural;
    let prevOverrun = 0;
    if (seg.hardTop && seg.fixedStartSec != null) {
      start = seg.fixedStartSec;
      if (natural > start) prevOverrun = natural - start;
    }
    const end = start + seg.plannedDurationSec;
    const mat = seg.materialDurationSec;
    result.push({
      id: seg.id,
      startSec: start,
      endSec: end,
      gapSec: Math.max(0, seg.plannedDurationSec - (mat ?? 0)),
      surplusSec: mat != null ? Math.max(0, mat - seg.plannedDurationSec) : 0,
      slackBeforeSec: Math.max(0, start - natural),
      prevOverrunSec: prevOverrun,
      missingMaterial: mat == null,
    });
    prevEnd = end;
    prevOverlap = seg.overlapNextSec;
  }
  return result;
}

/** 模拟播出事件 */
export interface BroadcastEvent {
  segmentId: number | string;
  type: 'start' | 'end';
  atSec: number; // 当日 0 点起秒
}

export interface CompareRow {
  segmentId: number | string;
  title: string;
  kind: SegmentKind;
  hardTop: boolean;
  plannedStartSec: number;
  plannedEndSec: number;
  actualStartSec: number | null;
  actualEndSec: number | null;
  startDriftSec: number | null; // 实际开始 - 计划开始
  endDriftSec: number | null;   // 实际结束 - 计划结束
}

/** 计划时间线与模拟播出事件对照 */
export function comparePlan(
  segments: SegmentInput[],
  timings: SegmentTiming[],
  events: BroadcastEvent[],
): CompareRow[] {
  return segments.map((seg, i) => {
    const evs = events.filter((e) => String(e.segmentId) === String(seg.id));
    const startEv = evs.filter((e) => e.type === 'start').sort((a, b) => a.atSec - b.atSec)[0];
    const endEv = evs.filter((e) => e.type === 'end').sort((a, b) => a.atSec - b.atSec)[0];
    const t = timings[i];
    return {
      segmentId: seg.id,
      title: seg.title,
      kind: seg.kind,
      hardTop: seg.hardTop,
      plannedStartSec: t.startSec,
      plannedEndSec: t.endSec,
      actualStartSec: startEv ? startEv.atSec : null,
      actualEndSec: endEv ? endEv.atSec : null,
      startDriftSec: startEv ? startEv.atSec - t.startSec : null,
      endDriftSec: endEv ? endEv.atSec - t.endSec : null,
    };
  });
}

/** 秒（当日 0 点起）→ "HH:MM:SS" */
export function fmtHMS(sec: number | null | undefined): string {
  if (sec == null || Number.isNaN(sec)) return '—';
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(r)}`;
}

/** "HH:MM" 或 "HH:MM:SS" → 秒；非法输入返回 null */
export function parseHMS(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text.trim());
  if (!m) return null;
  const sec = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0);
  return sec < 24 * 3600 ? sec : null;
}

/** 秒 → "MM:SS" 时长 */
export function fmtDur(sec: number | null | undefined): string {
  if (sec == null || Number.isNaN(sec)) return '—';
  const s = Math.round(sec);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** 漂移秒数 → "+8s" / "-5s" / "准点" */
export function fmtDrift(sec: number | null | undefined): string {
  if (sec == null) return '—';
  if (sec === 0) return '准点';
  return sec > 0 ? `+${sec}s` : `${sec}s`;
}
