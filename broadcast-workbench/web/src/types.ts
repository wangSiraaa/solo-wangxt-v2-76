import type { PlannedItem, TimelineConflict } from './timeline';

export interface Material {
  id: string;
  title: string;
  type: string;
  durationSec: number;
}

/** 服务端返回的计划段与本地 computeTimeline 输出同构 */
export type PlannedItemDto = PlannedItem;

export interface TimelineDto {
  items: PlannedItemDto[];
  totalGapSec: number;
  conflicts: TimelineConflict[];
  endAt: string | null;
}

export interface ScheduleDto {
  id: string;
  name: string;
  broadcastDate: string;
  startAt: string;
  status: string;
  version: number;
  publishedAt: string | null;
}

export interface ScheduleBundle {
  schedule: ScheduleDto;
  timeline: TimelineDto;
}

export interface Board {
  date: string;
  published: ScheduleBundle | null;
  draft: ScheduleBundle | null;
}

export interface ComparisonRow {
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
  startDeviationSec: number | null;
  endDeviationSec: number | null;
  status: 'pending' | 'on-time' | 'early' | 'late';
}

export interface Comparison {
  scheduleId: string;
  rows: ComparisonRow[];
  summary: {
    total: number;
    started: number;
    late: number;
    early: number;
    onTime: number;
    pending: number;
    maxAbsStartDeviationSec: number;
    hardItems: { itemId: string; title: string; startDeviationSec: number | null }[];
  };
}

export interface SimOverride {
  itemId: string;
  extraDurationSec?: number;
  startDelaySec?: number;
}

export interface UpsertItem {
  id: string;
  materialId: string | null;
  title: string;
  materialType: string;
  durationSec: number;
  overlapSec: number;
  hardStartAt: string | null;
  sourceItemId: string | null;
}

/** 编辑器里的草稿段（硬整点拆成 hard + hardTime 便于输入） */
export interface EditableItem {
  id: string;
  materialId: string | null;
  title: string;
  materialType: string;
  durationSec: number;
  overlapSec: number;
  hard: boolean;
  hardTime: string;
  sourceItemId: string | null;
}
