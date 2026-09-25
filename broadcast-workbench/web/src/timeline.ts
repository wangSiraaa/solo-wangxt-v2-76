/**
 * 播出时间账核心算法 —— 与 server/src/common/timeline.ts 同源，
 * 前端用它做编辑时的即时预览，后端落库时以同一套规则复核。
 * 修改时请两边同步。
 */

export interface TimelineItemInput {
  id: string;
  title: string;
  materialType: string;
  durationSec: number;
  overlapSec: number;
  hardStartAt: string | null;
  sourceItemId?: string | null;
  materialId?: string | null;
  position?: number;
}

export interface PlannedItem extends TimelineItemInput {
  plannedStartAt: string;
  plannedEndAt: string;
  appliedOverlapSec: number;
  gapBeforeSec: number;
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
