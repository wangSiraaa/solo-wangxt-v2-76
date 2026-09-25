/**
 * 播出时间账核心算法（纯函数，前端即时预览与后端落库共用同一份逻辑，
 * 见 web/src/timeline.ts —— 修改时请两边同步）。
 *
 * 规则：
 * 1. 普通节目段：计划开始 = 上一段计划结束 - 本段转场重叠（重叠被钳制在上一段时长内）。
 * 2. 硬整点段：计划开始被钉死在 hardStartAt，任何前序超时都不能把它推迟；
 *    - 前序结束时距整点还有富余 → 记为缺口 gapBeforeSec（素材不足，需补片）；
 *    - 前序结束冲过整点     → 记为冲突 overrunBeforeSec（前序将被硬切，整点照常开播）。
 */

export interface TimelineItemInput {
  id: string;
  title: string;
  materialType: string;
  durationSec: number;
  /** 与上一段的转场重叠秒数（音乐/台标常用） */
  overlapSec: number;
  /** 硬整点：ISO 时间，非空表示该段必须准点开播 */
  hardStartAt: string | null;
  /** 血缘 id：草稿段与已发布段的对照键（sourceItemId ?? id） */
  sourceItemId?: string | null;
  materialId?: string | null;
  position?: number;
}

export interface PlannedItem extends TimelineItemInput {
  plannedStartAt: string;
  plannedEndAt: string;
  /** 实际生效的转场重叠（钳制后） */
  appliedOverlapSec: number;
  /** 本段开始前的缺口秒数（等待硬整点） */
  gapBeforeSec: number;
  /** 前序内容冲入本硬整点的秒数（冲突，前序将被硬切） */
  overrunBeforeSec: number;
}

export interface TimelineConflict {
  itemId: string;
  itemTitle: string;
  overrunSec: number;
}

export interface TimelineResult {
  items: PlannedItem[];
  totalGapSec: number;
  conflicts: TimelineConflict[];
  endAt: string | null;
}

const SEC = 1000;

export function computeTimeline(
  items: TimelineItemInput[],
  scheduleStartAt: string,
): TimelineResult {
  const planned: PlannedItem[] = [];
  const conflicts: TimelineConflict[] = [];
  let totalGapSec = 0;
  let prevEnd: number | null = null;
  let prevDuration = 0;

  for (const item of items) {
    let startMs: number;
    let appliedOverlapSec = 0;
    let gapBeforeSec = 0;
    let overrunBeforeSec = 0;

    if (item.hardStartAt) {
      // 硬整点：钉死开播时间，不吸收前序转场重叠
      startMs = Date.parse(item.hardStartAt);
      if (prevEnd !== null) {
        if (prevEnd < startMs) {
          gapBeforeSec = (startMs - prevEnd) / SEC;
        } else if (prevEnd > startMs) {
          overrunBeforeSec = (prevEnd - startMs) / SEC;
          conflicts.push({ itemId: item.id, itemTitle: item.title, overrunSec: overrunBeforeSec });
        }
      }
    } else if (prevEnd === null) {
      startMs = Date.parse(scheduleStartAt);
    } else {
      appliedOverlapSec = Math.min(Math.max(item.overlapSec, 0), prevDuration);
      startMs = prevEnd - appliedOverlapSec * SEC;
    }

    const endMs = startMs + item.durationSec * SEC;
    planned.push({
      ...item,
      plannedStartAt: new Date(startMs).toISOString(),
      plannedEndAt: new Date(endMs).toISOString(),
      appliedOverlapSec,
      gapBeforeSec,
      overrunBeforeSec,
    });
    totalGapSec += gapBeforeSec;
    prevEnd = endMs;
    prevDuration = item.durationSec;
  }

  return {
    items: planned,
    totalGapSec,
    conflicts,
    endAt: prevEnd === null ? null : new Date(prevEnd).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// 计划 vs 实际（模拟播出事件）对照
// ---------------------------------------------------------------------------

export type EventType = 'start' | 'end';

export interface ActualEvent {
  itemId: string;
  type: EventType;
  occurredAt: string;
}

export type PlayStatus = 'pending' | 'on-time' | 'early' | 'late';

export interface ItemComparison {
  itemId: string;
  title: string;
  materialType: string;
  hardStartAt: string | null;
  plannedStartAt: string;
  plannedEndAt: string;
  plannedDurationSec: number;
  actualStartAt: string | null;
  actualEndAt: string | null;
  actualDurationSec: number | null;
  /** 实际开始 - 计划开始（秒），正=晚播，负=早播 */
  startDeviationSec: number | null;
  endDeviationSec: number | null;
  status: PlayStatus;
}

export function compareWithEvents(
  planned: PlannedItem[],
  events: ActualEvent[],
  toleranceSec = 2,
): ItemComparison[] {
  const byItem = new Map<string, { start?: number; end?: number }>();
  for (const e of events) {
    const t = Date.parse(e.occurredAt);
    const rec = byItem.get(e.itemId) ?? {};
    if (e.type === 'start') rec.start = rec.start === undefined ? t : Math.min(rec.start, t);
    else rec.end = rec.end === undefined ? t : Math.max(rec.end, t);
    byItem.set(e.itemId, rec);
  }

  return planned.map((p) => {
    const rec = byItem.get(p.id);
    const actualStart = rec?.start ?? null;
    const actualEnd = rec?.end ?? null;
    const startDeviationSec =
      actualStart === null ? null : Math.round((actualStart - Date.parse(p.plannedStartAt)) / SEC);
    const endDeviationSec =
      actualEnd === null ? null : Math.round((actualEnd - Date.parse(p.plannedEndAt)) / SEC);
    const actualDurationSec =
      actualStart === null || actualEnd === null
        ? null
        : Math.round((actualEnd - actualStart) / SEC);

    let status: PlayStatus = 'pending';
    if (startDeviationSec !== null) {
      status =
        Math.abs(startDeviationSec) <= toleranceSec ? 'on-time' : startDeviationSec > 0 ? 'late' : 'early';
    }

    return {
      itemId: p.id,
      title: p.title,
      materialType: p.materialType,
      hardStartAt: p.hardStartAt ?? null,
      plannedStartAt: p.plannedStartAt,
      plannedEndAt: p.plannedEndAt,
      plannedDurationSec: p.durationSec,
      actualStartAt: actualStart === null ? null : new Date(actualStart).toISOString(),
      actualEndAt: actualEnd === null ? null : new Date(actualEnd).toISOString(),
      actualDurationSec,
      startDeviationSec,
      endDeviationSec,
      status,
    };
  });
}

// ---------------------------------------------------------------------------
// 模拟播出：按计划走带，允许注入超时/延迟；硬整点永远准点（播控会硬切过去）
// ---------------------------------------------------------------------------

export interface SimOverride {
  itemId: string;
  /** 实际多播的秒数（如音乐拖长） */
  extraDurationSec?: number;
  /** 实际开播比自然衔接晚的秒数 */
  startDelaySec?: number;
}

export function simulatePlayout(
  planned: PlannedItem[],
  overrides: SimOverride[] = [],
): ActualEvent[] {
  const map = new Map(overrides.map((o) => [o.itemId, o]));
  const events: ActualEvent[] = [];
  let prevActualEnd: number | null = null;

  for (const p of planned) {
    const o = map.get(p.id);
    let startMs: number;
    if (p.hardStartAt) {
      // 硬整点：无论前面拖成什么样，都按计划整点开播
      startMs = Date.parse(p.plannedStartAt);
    } else if (prevActualEnd === null) {
      startMs = Date.parse(p.plannedStartAt) + (o?.startDelaySec ?? 0) * SEC;
    } else {
      startMs = prevActualEnd - p.appliedOverlapSec * SEC + (o?.startDelaySec ?? 0) * SEC;
    }
    const endMs = startMs + (p.durationSec + (o?.extraDurationSec ?? 0)) * SEC;

    events.push({ itemId: p.id, type: 'start', occurredAt: new Date(startMs).toISOString() });
    events.push({ itemId: p.id, type: 'end', occurredAt: new Date(endMs).toISOString() });
    prevActualEnd = endMs;
  }

  return events;
}
