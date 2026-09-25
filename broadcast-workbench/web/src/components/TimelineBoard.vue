<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { fmtDelta, fmtDur, fmtTime, TYPE_LABEL } from '../format';
import type { Comparison, TimelineDto } from '../types';

interface Block {
  key: string;
  itemId: string | null;
  kind: 'item' | 'gap' | 'conflict' | 'actual';
  materialType: string;
  startMs: number;
  endMs: number;
  hard: boolean;
  overlapSec: number;
  label: string;
  sub: string;
  status?: string;
}

const props = defineProps<{
  published: TimelineDto | null;
  draft: TimelineDto | null;
  comparison: Comparison | null;
}>();

// ------------------------------------------------------------- 组装泳道

function plannedBlocks(tl: TimelineDto, lane: string): Block[] {
  const blocks: Block[] = [];
  let prevEnd: number | null = null;
  for (const it of tl.items) {
    const start = Date.parse(it.plannedStartAt);
    const end = Date.parse(it.plannedEndAt);
    if (it.gapBeforeSec > 0 && prevEnd !== null) {
      blocks.push({
        key: `${lane}-gap-${it.id}`,
        itemId: null,
        kind: 'gap',
        materialType: '',
        startMs: prevEnd,
        endMs: start,
        hard: false,
        overlapSec: 0,
        label: `缺口 ${fmtDur(it.gapBeforeSec)}`,
        sub: '素材不足',
      });
    }
    if (it.overrunBeforeSec > 0) {
      blocks.push({
        key: `${lane}-ovl-${it.id}`,
        itemId: null,
        kind: 'conflict',
        materialType: '',
        startMs: start - it.overrunBeforeSec * 1000,
        endMs: start,
        hard: false,
        overlapSec: 0,
        label: `冲突 ${fmtDur(it.overrunBeforeSec)}`,
        sub: '前序超时，将被硬切',
      });
    }
    blocks.push({
      key: `${lane}-${it.id}`,
      itemId: it.id,
      kind: 'item',
      materialType: it.materialType,
      startMs: start,
      endMs: end,
      hard: !!it.hardStartAt,
      overlapSec: it.appliedOverlapSec,
      label: `${it.hardStartAt ? '⏰ ' : ''}${it.title}`,
      sub: `${fmtTime(it.plannedStartAt)} · ${fmtDur(it.durationSec)}`,
    });
    prevEnd = end;
  }
  return blocks;
}

const lanes = computed(() => {
  const out: { name: string; blocks: Block[] }[] = [];
  if (props.draft) out.push({ name: '计划·草稿', blocks: plannedBlocks(props.draft, 'd') });
  if (props.published) out.push({ name: '计划·已发布', blocks: plannedBlocks(props.published, 'p') });
  if (props.comparison) {
    const blocks: Block[] = props.comparison.rows
      .filter((r) => r.actualStartAt)
      .map((r) => {
        const start = Date.parse(r.actualStartAt!);
        const end = r.actualEndAt ? Date.parse(r.actualEndAt) : Date.parse(r.plannedEndAt);
        return {
          key: `a-${r.itemId}`,
          itemId: r.itemId,
          kind: 'actual' as const,
          materialType: r.materialType,
          startMs: start,
          endMs: end,
          hard: !!r.hardStartAt,
          overlapSec: 0,
          label: `${r.hardStartAt ? '⏰ ' : ''}${r.title}`,
          sub: `${fmtTime(r.actualStartAt)} · 偏差 ${fmtDelta(r.startDeviationSec)}`,
          status: r.status,
        };
      });
    out.push({ name: '实际·模拟事件', blocks });
  }
  return out;
});

// ------------------------------------------------------------- 比例尺

const wrap = ref<HTMLElement>();
const wrapWidth = ref(1200);
let ro: ResizeObserver | null = null;
onMounted(() => {
  if (wrap.value) {
    ro = new ResizeObserver((es) => (wrapWidth.value = es[0].contentRect.width));
    ro.observe(wrap.value);
  }
});
onBeforeUnmount(() => ro?.disconnect());

const LABEL_W = 118;

const range = computed(() => {
  let min = Infinity;
  let max = -Infinity;
  for (const lane of lanes.value) {
    for (const b of lane.blocks) {
      min = Math.min(min, b.startMs);
      max = Math.max(max, b.endMs);
    }
  }
  if (!isFinite(min)) {
    min = Date.now();
    max = min + 3600_000;
  }
  return { min: min - 30_000, max: max + 30_000 };
});

const pxPerSec = computed(() => {
  const usable = Math.max(400, wrapWidth.value - LABEL_W);
  return usable / ((range.value.max - range.value.min) / 1000);
});

const ticks = computed(() => {
  const spanSec = (range.value.max - range.value.min) / 1000;
  const steps = [60, 120, 300, 600, 900, 1800, 3600];
  const step = steps.find((s) => spanSec / s <= 14) ?? 3600;
  const out: { ms: number; label: string; major: boolean }[] = [];
  const first = Math.ceil(range.value.min / (step * 1000)) * step * 1000;
  for (let t = first; t <= range.value.max; t += step * 1000) {
    const d = new Date(t);
    out.push({
      ms: t,
      label: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      major: d.getMinutes() === 0,
    });
  }
  return out;
});

const x = (ms: number) => ((ms - range.value.min) / 1000) * pxPerSec.value;
const blockStyle = (b: Block) => ({
  left: `${x(b.startMs)}px`,
  width: `${Math.max(3, ((b.endMs - b.startMs) / 1000) * pxPerSec.value)}px`,
});
const typeLabel = (t: string) => TYPE_LABEL[t] ?? t;
</script>

<template>
  <div class="tl" ref="wrap">
    <div class="tl-ruler" :style="{ paddingLeft: LABEL_W + 'px' }">
      <div class="ruler-inner">
        <div
          v-for="t in ticks"
          :key="t.ms"
          class="tick"
          :class="{ major: t.major }"
          :style="{ left: x(t.ms) + 'px' }"
        >
          <span>{{ t.label }}</span>
        </div>
      </div>
    </div>

    <div v-for="lane in lanes" :key="lane.name" class="tl-lane">
      <div class="lane-label" :style="{ width: LABEL_W + 'px' }">{{ lane.name }}</div>
      <div class="lane-track">
        <div
          v-for="b in lane.blocks"
          :key="b.key"
          class="blk"
          :class="[b.kind, b.materialType, b.status, { hard: b.hard }]"
          :style="blockStyle(b)"
          :title="`${b.label}\n${b.sub}${b.overlapSec ? `\n转场重叠 ${b.overlapSec}s` : ''}`"
        >
          <i v-if="b.overlapSec > 0" class="ovl" :style="{ width: b.overlapSec * pxPerSec + 'px' }"></i>
          <span class="blk-label">{{ b.label }}</span>
          <span class="blk-sub">{{ b.sub }}</span>
          <em v-if="b.kind === 'item' && b.materialType" class="blk-type">{{ typeLabel(b.materialType) }}</em>
        </div>
        <div v-if="lane.blocks.length === 0" class="lane-empty">（无数据）</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tl {
  overflow: hidden;
  border: 1px solid #26314b;
  border-radius: 10px;
  background: #101728;
}
.tl-ruler {
  position: relative;
  height: 26px;
  border-bottom: 1px solid #26314b;
  background: #0c1220;
}
.ruler-inner {
  position: relative;
  height: 100%;
}
.tick {
  position: absolute;
  top: 0;
  height: 100%;
  border-left: 1px solid #2b3852;
  padding-left: 4px;
  font-size: 10px;
  color: #7d8db3;
  line-height: 26px;
}
.tick.major {
  border-left-color: #4c5f8f;
  color: #c3d1f2;
  font-weight: 600;
}
.tl-lane {
  display: flex;
  border-bottom: 1px solid #1d2740;
}
.tl-lane:last-child {
  border-bottom: none;
}
.lane-label {
  flex: none;
  display: flex;
  align-items: center;
  padding: 0 10px;
  font-size: 12px;
  color: #9fb0d8;
  background: #0c1220;
  border-right: 1px solid #26314b;
}
.lane-track {
  position: relative;
  flex: 1;
  height: 58px;
}
.lane-empty {
  padding: 18px 12px;
  color: #5a6a92;
  font-size: 12px;
}
.blk {
  position: absolute;
  top: 7px;
  height: 44px;
  border-radius: 6px;
  overflow: hidden;
  padding: 4px 6px;
  box-sizing: border-box;
  font-size: 11px;
  line-height: 1.25;
  color: #0d1424;
  white-space: nowrap;
}
.blk-label {
  display: block;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
}
.blk-sub {
  display: block;
  font-size: 10px;
  opacity: 0.85;
}
.blk-type {
  position: absolute;
  right: 4px;
  top: 3px;
  font-size: 9px;
  font-style: normal;
  opacity: 0.7;
}
.blk.item.news { background: #ff6b7a; }
.blk.item.music { background: #9d8cff; }
.blk.item.ident { background: #ffd166; }
.blk.item.program { background: #5fd0a5; }
.blk.item.weather { background: #6ec3ff; }
.blk.item.ad { background: #b8c0d8; }
.blk.hard {
  outline: 2px solid #ff3355;
  outline-offset: 1px;
  box-shadow: 0 0 10px rgba(255, 51, 85, 0.45);
}
.blk.gap {
  background: repeating-linear-gradient(45deg, #232c46 0 6px, #1a2238 6px 12px);
  border: 1px dashed #5a6a92;
  color: #9fb0d8;
}
.blk.conflict {
  background: repeating-linear-gradient(45deg, #5b1f2a 0 6px, #43151f 6px 12px);
  border: 1px dashed #ff5c6c;
  color: #ffb3bc;
}
.blk.actual {
  background: #3d4a6b;
  color: #dfe7fb;
  border: 1px solid #5a6a92;
}
.blk.actual.on-time { background: #2c7a5b; border-color: #4ed39a; }
.blk.actual.late { background: #8a5a2b; border-color: #ffb054; }
.blk.actual.early { background: #2b5f8a; border-color: #6ec3ff; }
.ovl {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: repeating-linear-gradient(-45deg, rgba(0, 0, 0, 0.35) 0 4px, transparent 4px 8px);
  border-right: 1px solid rgba(0, 0, 0, 0.5);
  pointer-events: none;
}
</style>
