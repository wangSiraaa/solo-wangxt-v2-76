<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  computeTimeline, fmtDrift, fmtDur, fmtHMS, parseHMS,
  type SegmentInput, type SegmentTiming,
} from '@shared/timeline';
import { api } from '../api';

interface Row {
  title: string;
  kind: string;
  plannedDurationSec: number;
  overlapNextSec: number;
  hardTop: boolean;
  fixedStartSec: number | null;
  materialId: number | null;
  notes: string;
}

const props = defineProps<{ rundown: any; materials: any[] }>();
const emit = defineEmits<{ (e: 'changed'): void }>();

const KINDS: Array<[string, string]> = [
  ['program', '节目'], ['news', '新闻'], ['music', '音乐'], ['ident', '台标'],
];
const kindLabel = (k: string) => KINDS.find(([v]) => v === k)?.[1] ?? k;

const rows = ref<Row[]>([]);
const baselineStarts = ref<number[]>([]); // 上次保存时各段的计划开始
const fixedStartText = ref<string[]>([]);
const saving = ref(false);
const publishing = ref(false);
const message = ref('');
const error = ref('');

function loadFromRundown() {
  const segs = props.rundown?.segments ?? [];
  rows.value = segs.map((s: any): Row => ({
    title: s.title,
    kind: s.kind,
    plannedDurationSec: s.planned_duration_sec,
    overlapNextSec: s.overlap_next_sec,
    hardTop: s.hard_top,
    fixedStartSec: s.fixed_start_sec,
    materialId: s.material_id,
    notes: s.notes ?? '',
  }));
  fixedStartText.value = segs.map((s: any) => (s.fixed_start_sec != null ? fmtHMS(s.fixed_start_sec) : ''));
  baselineStarts.value = (props.rundown?.timeline ?? []).map((t: SegmentTiming) => t.startSec);
}
watch(() => props.rundown, loadFromRundown, { immediate: true, deep: true });

const dayStartSec = computed(() => props.rundown?.day_start_sec ?? 0);

const materialById = computed(() => {
  const map = new Map<number, any>();
  for (const m of props.materials) map.set(m.id, m);
  return map;
});

// 本地即时重算：与服务端同一套 computeTimeline
const timeline = computed<SegmentTiming[]>(() => {
  const inputs: SegmentInput[] = rows.value.map((r, i) => ({
    id: i,
    title: r.title,
    kind: r.kind as SegmentInput['kind'],
    plannedDurationSec: Number(r.plannedDurationSec) || 0,
    overlapNextSec: Number(r.overlapNextSec) || 0,
    hardTop: r.hardTop,
    fixedStartSec: r.hardTop ? r.fixedStartSec : null,
    materialDurationSec: r.materialId != null
      ? materialById.value.get(r.materialId)?.duration_sec ?? null
      : null,
  }));
  return computeTimeline(dayStartSec.value, inputs);
});

// 相对上次保存，开始时间发生变化的段（受影响段）
const affected = computed<Set<number>>(() => {
  const set = new Set<number>();
  timeline.value.forEach((t, i) => {
    if (baselineStarts.value[i] !== undefined && baselineStarts.value[i] !== t.startSec) set.add(i);
    if (baselineStarts.value[i] === undefined) set.add(i); // 新增段
  });
  return set;
});

const dirty = computed(() => affected.value.size > 0
  || rows.value.length !== (props.rundown?.segments?.length ?? 0));

function onFixedStartInput(i: number) {
  const sec = parseHMS(fixedStartText.value[i] ?? '');
  rows.value[i].fixedStartSec = sec;
}

function insertRow(i: number) {
  rows.value.splice(i, 0, {
    title: '新节目段', kind: 'program', plannedDurationSec: 300,
    overlapNextSec: 0, hardTop: false, fixedStartSec: null, materialId: null, notes: '',
  });
  fixedStartText.value.splice(i, 0, '');
}
function removeRow(i: number) {
  rows.value.splice(i, 1);
  fixedStartText.value.splice(i, 1);
}
function moveRow(i: number, dir: -1 | 1) {
  const j = i + dir;
  if (j < 0 || j >= rows.value.length) return;
  [rows.value[i], rows.value[j]] = [rows.value[j], rows.value[i]];
  [fixedStartText.value[i], fixedStartText.value[j]] = [fixedStartText.value[j], fixedStartText.value[i]];
}

async function save() {
  saving.value = true; error.value = ''; message.value = '';
  try {
    const res = await api.saveSegments(props.rundown.id, rows.value.map((r) => ({
      title: r.title, kind: r.kind,
      plannedDurationSec: Number(r.plannedDurationSec),
      overlapNextSec: Number(r.overlapNextSec),
      hardTop: r.hardTop,
      fixedStartSec: r.hardTop ? r.fixedStartSec : null,
      materialId: r.materialId, notes: r.notes,
    })));
    message.value = res.affectedPositions.length
      ? `已保存。受影响（开始时间变化）的段：${res.affectedPositions.map((p) => p + 1).join('、')}`
      : '已保存，无段开始时间变化。';
    emit('changed');
  } catch (e: any) {
    error.value = e.message;
  } finally {
    saving.value = false;
  }
}

async function publish() {
  publishing.value = true; error.value = ''; message.value = '';
  try {
    if (dirty.value) await save();
    const v = await api.publish(props.rundown.id);
    message.value = `已发布为版本 v${v.version}（只读）。草稿仍可继续修改，不影响已发布版本。`;
    emit('changed');
  } catch (e: any) {
    error.value = e.message;
  } finally {
    publishing.value = false;
  }
}
</script>

<template>
  <div class="panel">
    <div class="toolbar">
      <h2>草稿：{{ rundown.name }}（{{ rundown.broadcast_date }}，{{ fmtHMS(rundown.day_start_sec) }} 开播）</h2>
      <span style="flex:1"></span>
      <button class="act" @click="insertRow(rows.length)">＋末尾加段</button>
      <button class="act primary" :disabled="saving" @click="save">保存草稿</button>
      <button class="act" :disabled="publishing" @click="publish">发布为新版本</button>
    </div>
    <div class="legend">
      <span><span class="tag tag-hard">硬整点</span> 锚定固定时刻，前序超时不顺延</span>
      <span><span class="tag tag-gap">缺口</span> 素材短于计划时长</span>
      <span><span class="tag tag-overrun">超时侵入</span> 前序内容被硬整点切掉</span>
      <span><span class="tag tag-slack">空档</span> 硬整点前的空闲</span>
      <span style="background:var(--affected);padding:0 6px;border:1px solid #d4a72c;border-radius:4px;">黄底</span>
      <span>= 相对上次保存开始时间有变化的段</span>
    </div>

    <table>
      <thead>
        <tr>
          <th>#</th><th>标题</th><th>类型</th><th>素材（时长）</th><th>计划时长(s)</th>
          <th>转场重叠(s)</th><th>硬整点</th><th>固定开始</th>
          <th>计划开始</th><th>计划结束</th><th>缺口/状态</th><th>备注</th><th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in rows" :key="i"
            :class="{ affected: affected.has(i), 'hard-row': row.hardTop }">
          <td class="mono">{{ i + 1 }}</td>
          <td><input type="text" v-model="row.title" /></td>
          <td>
            <select v-model="row.kind">
              <option v-for="[v, l] in KINDS" :key="v" :value="v">{{ l }}</option>
            </select>
          </td>
          <td>
            <select v-model="row.materialId">
              <option :value="null">（未挂素材）</option>
              <option v-for="m in materials" :key="m.id" :value="m.id">
                {{ m.title }}（{{ fmtDur(m.duration_sec) }}）
              </option>
            </select>
          </td>
          <td><input class="dur" type="number" min="1" v-model.number="row.plannedDurationSec" /></td>
          <td><input class="dur" type="number" min="0" v-model.number="row.overlapNextSec" /></td>
          <td style="text-align:center"><input type="checkbox" v-model="row.hardTop" /></td>
          <td>
            <input v-if="row.hardTop" class="time" type="text" placeholder="HH:MM:SS"
                   v-model="fixedStartText[i]" @input="onFixedStartInput(i)"
                   :style="row.fixedStartSec == null ? 'border-color:var(--hard)' : ''" />
            <span v-else class="hint">—</span>
          </td>
          <td class="mono">{{ fmtHMS(timeline[i]?.startSec) }}</td>
          <td class="mono">{{ fmtHMS(timeline[i]?.endSec) }}</td>
          <td>
            <span v-if="row.hardTop" class="tag tag-hard">硬整点</span>
            <span v-if="timeline[i]?.missingMaterial" class="tag tag-missing">未挂素材</span>
            <span v-else-if="timeline[i]?.gapSec > 0" class="tag tag-gap">缺口 {{ timeline[i].gapSec }}s</span>
            <span v-if="timeline[i]?.surplusSec > 0" class="tag tag-slack">富余 {{ timeline[i].surplusSec }}s</span>
            <span v-if="timeline[i]?.prevOverrunSec > 0" class="tag tag-overrun">
              前序超时 {{ timeline[i].prevOverrunSec }}s 被切
            </span>
            <span v-if="row.hardTop && timeline[i]?.slackBeforeSec > 0" class="tag tag-slack">
              空档 {{ timeline[i].slackBeforeSec }}s
            </span>
          </td>
          <td><input type="text" v-model="row.notes" placeholder="—" /></td>
          <td>
            <button class="act mini" @click="moveRow(i, -1)">↑</button>
            <button class="act mini" @click="moveRow(i, 1)">↓</button>
            <button class="act mini" @click="insertRow(i + 1)">＋</button>
            <button class="act mini danger" @click="removeRow(i)">删</button>
          </td>
        </tr>
      </tbody>
    </table>

    <p v-if="message" class="hint">{{ message }}</p>
    <p v-if="error" class="err">{{ error }}</p>
    <p class="hint">
      提示：修改任意段的时长/转场重叠/顺序后，下方"计划开始"列会即时重算，黄底行为受影响的后续段；
      硬整点段的开始时刻不会随前序变化——前序超出的部分会以"超时侵入"标出。
    </p>
  </div>
</template>
