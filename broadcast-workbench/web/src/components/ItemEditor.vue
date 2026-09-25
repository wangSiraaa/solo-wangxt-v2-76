<script setup lang="ts">
import { ref } from 'vue';
import { fmtDelta, fmtDur, fmtTime, TYPE_LABEL } from '../format';
import type { EditableItem, Material, PlannedItemDto } from '../types';

const props = defineProps<{
  items: EditableItem[];
  planned: PlannedItemDto[];
  deltas: Map<string, number | 'new'>;
  materials: Material[];
  removedCount: number;
  totalGapSec: number;
  conflictCount: number;
}>();

const emit = defineEmits<{
  update: [index: number, patch: Partial<EditableItem>];
  move: [index: number, dir: -1 | 1];
  remove: [index: number];
  add: [materialId: string];
}>();

const pick = ref('');

function add() {
  if (!pick.value) return;
  emit('add', pick.value);
  pick.value = '';
}

const deltaOf = (id: string) => props.deltas.get(id);
const typeLabel = (t: string) => TYPE_LABEL[t] ?? t;
</script>

<template>
  <div class="editor">
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>节目段</th>
          <th>类型</th>
          <th>时长(秒)</th>
          <th>转场重叠(秒)</th>
          <th>硬整点</th>
          <th>计划开始</th>
          <th>影响</th>
          <th>提示</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(it, i) in items"
          :key="it.id"
          :class="{ hard: it.hard, 'is-new': deltaOf(it.id) === 'new' }"
        >
          <td class="pos">{{ i + 1 }}</td>
          <td>
            <input
              class="title"
              :value="it.title"
              @change="emit('update', i, { title: ($event.target as HTMLInputElement).value })"
            />
          </td>
          <td><span class="type" :class="it.materialType">{{ typeLabel(it.materialType) }}</span></td>
          <td>
            <input
              class="num"
              type="number"
              min="1"
              :value="it.durationSec"
              @change="emit('update', i, { durationSec: Number(($event.target as HTMLInputElement).value) })"
            />
          </td>
          <td>
            <input
              class="num"
              type="number"
              min="0"
              :value="it.overlapSec"
              :disabled="it.hard"
              :title="it.hard ? '硬整点钉死开播，不吸收重叠' : '与上一段的转场重叠秒数'"
              @change="emit('update', i, { overlapSec: Number(($event.target as HTMLInputElement).value) })"
            />
          </td>
          <td class="hard-cell">
            <input
              type="checkbox"
              :checked="it.hard"
              @change="emit('update', i, { hard: ($event.target as HTMLInputElement).checked })"
            />
            <input
              v-if="it.hard"
              type="time"
              step="1"
              :value="it.hardTime"
              @change="emit('update', i, { hardTime: ($event.target as HTMLInputElement).value })"
            />
          </td>
          <td class="planned">
            {{ planned[i] ? fmtTime(planned[i].plannedStartAt) : '—' }}
            <small v-if="planned[i]?.appliedOverlapSec">（重叠 {{ planned[i].appliedOverlapSec }}s）</small>
          </td>
          <td>
            <span
              v-if="deltaOf(it.id) === 'new'"
              class="delta new"
            >新增</span>
            <span
              v-else-if="deltaOf(it.id) !== undefined && deltaOf(it.id) !== 0"
              class="delta"
              :class="(deltaOf(it.id) as number) > 0 ? 'late' : 'early'"
            >{{ fmtDelta(deltaOf(it.id) as number) }}</span>
            <span v-else class="delta none">—</span>
          </td>
          <td class="warn">
            <span v-if="planned[i]?.gapBeforeSec" class="chip gap">前方缺口 {{ fmtDur(planned[i].gapBeforeSec) }}</span>
            <span v-if="planned[i]?.overrunBeforeSec" class="chip conflict">前序超时 {{ fmtDur(planned[i].overrunBeforeSec) }} 被硬切</span>
          </td>
          <td class="ops">
            <button title="上移" :disabled="i === 0" @click="emit('move', i, -1)">↑</button>
            <button title="下移" :disabled="i === items.length - 1" @click="emit('move', i, 1)">↓</button>
            <button title="删除" @click="emit('remove', i)">✕</button>
          </td>
        </tr>
      </tbody>
    </table>

    <div class="editor-footer">
      <div class="add-row">
        <select v-model="pick">
          <option value="" disabled>选择素材添加节目段…</option>
          <option v-for="m in materials" :key="m.id" :value="m.id">
            {{ m.title }}（{{ typeLabel(m.type) }} · {{ fmtDur(m.durationSec) }}）
          </option>
        </select>
        <button :disabled="!pick" @click="add">添加</button>
      </div>
      <div class="summary">
        <span v-if="totalGapSec > 0" class="chip gap">总缺口 {{ fmtDur(totalGapSec) }}（素材不足）</span>
        <span v-if="conflictCount > 0" class="chip conflict">{{ conflictCount }} 处硬整点冲突</span>
        <span v-if="removedCount > 0" class="chip removed">较已发布版移除 {{ removedCount }} 段</span>
        <span v-if="totalGapSec === 0 && conflictCount === 0" class="chip ok">时间账平衡</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
th {
  text-align: left;
  color: #7d8db3;
  font-weight: 500;
  font-size: 12px;
  padding: 6px 8px;
  border-bottom: 1px solid #26314b;
}
td {
  padding: 5px 8px;
  border-bottom: 1px solid #1d2740;
  vertical-align: middle;
}
tr.hard td {
  background: rgba(255, 51, 85, 0.06);
}
tr.hard td:first-child {
  box-shadow: inset 3px 0 0 #ff3355;
}
tr.is-new td {
  background: rgba(78, 211, 154, 0.05);
}
.pos {
  color: #5a6a92;
  width: 28px;
}
input.title {
  width: 180px;
  background: #0c1220;
  border: 1px solid #2b3852;
  color: #dfe7fb;
  border-radius: 5px;
  padding: 4px 6px;
}
input.num {
  width: 64px;
  background: #0c1220;
  border: 1px solid #2b3852;
  color: #dfe7fb;
  border-radius: 5px;
  padding: 4px 6px;
}
input[type='time'] {
  background: #0c1220;
  border: 1px solid #ff3355;
  color: #ffd7dd;
  border-radius: 5px;
  padding: 3px 5px;
  margin-left: 6px;
}
input:disabled {
  opacity: 0.35;
}
.hard-cell {
  white-space: nowrap;
}
.planned {
  font-variant-numeric: tabular-nums;
  color: #c3d1f2;
  white-space: nowrap;
}
.planned small {
  color: #7d8db3;
}
.type {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 10px;
  background: #2b3852;
  color: #c3d1f2;
}
.type.news { background: #5b1f2a; color: #ffb3bc; }
.type.music { background: #37306b; color: #cdc4ff; }
.type.ident { background: #5b4a1f; color: #ffe3a3; }
.type.program { background: #1f4b3a; color: #a9ecd2; }
.type.weather { background: #1f3f5b; color: #b3dbff; }
.delta {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
}
.delta.late { background: #5b3a1f; color: #ffc98a; }
.delta.early { background: #1f4b5b; color: #9ae2ff; }
.delta.new { background: #1f4b3a; color: #a9ecd2; }
.delta.none { color: #44507a; }
.chip {
  display: inline-block;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  margin-right: 6px;
}
.chip.gap { background: #2b3852; color: #c3d1f2; border: 1px dashed #5a6a92; }
.chip.conflict { background: #5b1f2a; color: #ffb3bc; }
.chip.removed { background: #3a2b52; color: #d3c2f2; }
.chip.ok { background: #1f4b3a; color: #a9ecd2; }
.ops button {
  background: #1a2238;
  border: 1px solid #2b3852;
  color: #9fb0d8;
  border-radius: 5px;
  margin-right: 4px;
  cursor: pointer;
  padding: 3px 8px;
}
.ops button:hover:not(:disabled) { background: #26314b; }
.ops button:disabled { opacity: 0.35; cursor: default; }
.editor-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 10px;
  flex-wrap: wrap;
  gap: 8px;
}
.add-row select {
  background: #0c1220;
  border: 1px solid #2b3852;
  color: #dfe7fb;
  border-radius: 6px;
  padding: 6px 8px;
  min-width: 260px;
}
.add-row button {
  margin-left: 8px;
  background: #1f4b3a;
  border: 1px solid #2c7a5b;
  color: #a9ecd2;
  border-radius: 6px;
  padding: 6px 14px;
  cursor: pointer;
}
.add-row button:disabled { opacity: 0.4; cursor: default; }
.warn { min-width: 140px; }
</style>
