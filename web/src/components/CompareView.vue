<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { fmtDrift, fmtHMS, type CompareRow } from '@shared/timeline';
import { api } from '../api';

const props = defineProps<{ published: any[] }>();

const selectedId = ref<number | null>(null);
const data = ref<{ rundown: any; rows: CompareRow[]; events: any[] } | null>(null);
const error = ref('');
const busy = ref(false);

const options = computed(() => props.published);
watch(options, (list) => {
  if (!selectedId.value && list.length) selectedId.value = list[list.length - 1].id;
}, { immediate: true });
watch(selectedId, load);

async function load() {
  if (!selectedId.value) { data.value = null; return; }
  error.value = '';
  try {
    data.value = await api.compare(selectedId.value);
  } catch (e: any) {
    error.value = e.message;
  }
}

async function simulate(fault: boolean) {
  if (!selectedId.value) return;
  busy.value = true; error.value = '';
  try {
    data.value = await api.simulate(selectedId.value, fault);
  } catch (e: any) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function clearEvents() {
  if (!selectedId.value) return;
  await api.clearEvents(selectedId.value);
  await load();
}

const hasEvents = computed(() => (data.value?.events?.length ?? 0) > 0);
const maxLate = computed(() => {
  const ds = (data.value?.rows ?? [])
    .filter((r) => r.hardTop && r.startDriftSec != null)
    .map((r) => r.startDriftSec as number);
  return ds.length ? Math.max(...ds) : null;
});

defineExpose({ reload: load });
</script>

<template>
  <div class="panel">
    <div class="toolbar">
      <h2>计划 vs 模拟播出对照</h2>
      <select v-model.number="selectedId" style="padding:4px 8px;">
        <option v-for="r in options" :key="r.id" :value="r.id">
          {{ r.name }} · {{ r.broadcast_date }} · v{{ r.version }}（已发布）
        </option>
      </select>
      <span style="flex:1"></span>
      <button class="act" :disabled="busy || !selectedId" @click="simulate(false)">模拟播出·正常</button>
      <button class="act" :disabled="busy || !selectedId" @click="simulate(true)">模拟播出·音乐转场算错</button>
      <button class="act danger" :disabled="!selectedId || !hasEvents" @click="clearEvents">清空事件</button>
    </div>

    <p v-if="!options.length" class="hint">还没有已发布版本。请先在"草稿编排"页发布一个版本。</p>

    <template v-if="data">
      <p v-if="maxLate !== null" class="hint">
        硬整点准点性：最大开播漂移
        <b :class="maxLate === 0 ? 'drift-ok' : 'drift-late'">{{ fmtDrift(maxLate) }}</b>
        —— 即使前序音乐转场算错，硬整点新闻仍锚定整点，前序段被硬切。
      </p>
      <table>
        <thead>
          <tr>
            <th>#</th><th>节目段</th><th>计划开始</th><th>计划结束</th>
            <th>实际开始</th><th>实际结束</th><th>开始漂移</th><th>结束漂移</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in data.rows" :key="row.segmentId" :class="{ 'hard-row': row.hardTop }">
            <td class="mono">{{ i + 1 }}</td>
            <td>
              {{ row.title }}
              <span v-if="row.hardTop" class="tag tag-hard">硬整点</span>
            </td>
            <td class="mono">{{ fmtHMS(row.plannedStartSec) }}</td>
            <td class="mono">{{ fmtHMS(row.plannedEndSec) }}</td>
            <td class="mono">{{ fmtHMS(row.actualStartSec) }}</td>
            <td class="mono">{{ fmtHMS(row.actualEndSec) }}</td>
            <td class="mono" :class="row.startDriftSec ? 'drift-late' : 'drift-ok'">
              {{ fmtDrift(row.startDriftSec) }}
            </td>
            <td class="mono" :class="row.endDriftSec ? 'drift-late' : 'drift-ok'">
              {{ fmtDrift(row.endDriftSec) }}
            </td>
          </tr>
        </tbody>
      </table>

      <details v-if="hasEvents" style="margin-top:12px;">
        <summary class="hint">模拟播出事件流（{{ data.events.length }} 条）</summary>
        <table style="margin-top:8px;">
          <thead><tr><th>时刻</th><th>事件</th><th>节目段ID</th></tr></thead>
          <tbody>
            <tr v-for="e in data.events" :key="e.segmentId + e.type + e.atSec">
              <td class="mono">{{ fmtHMS(e.atSec) }}</td>
              <td>{{ e.type === 'start' ? '开播' : '结束' }}</td>
              <td class="mono">{{ e.segmentId }}</td>
            </tr>
          </tbody>
        </table>
      </details>
      <p v-else class="hint">尚无播出事件。点击上方"模拟播出"生成一轮事件，或调用 POST /api/rundowns/:id/events 逐条上报。</p>
    </template>
    <p v-if="error" class="err">{{ error }}</p>
  </div>
</template>
