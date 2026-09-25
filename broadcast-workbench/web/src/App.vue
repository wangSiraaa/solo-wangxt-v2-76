<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { api } from './api';
import { computeTimeline } from './timeline';
import { fromTimeInput, toTimeInput } from './format';
import type {
  Board,
  Comparison,
  EditableItem,
  Material,
  PlannedItemDto,
  SimOverride,
  UpsertItem,
} from './types';
import TimelineBoard from './components/TimelineBoard.vue';
import ItemEditor from './components/ItemEditor.vue';
import ComparisonTable from './components/ComparisonTable.vue';

const todayStr = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const date = ref(todayStr());
const board = ref<Board | null>(null);
const materials = ref<Material[]>([]);
const comparison = ref<Comparison | null>(null);
const draftItems = ref<EditableItem[]>([]);
const saving = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');
const errorMsg = ref('');
const notice = ref('');
const busy = ref(false);

let hydrating = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

// ---------------------------------------------------------------- 加载

async function load() {
  errorMsg.value = '';
  try {
    const [b, mats] = await Promise.all([api.board(date.value), api.materials()]);
    board.value = b;
    materials.value = mats;
    hydrating = true;
    draftItems.value = b.draft ? b.draft.timeline.items.map(fromPlanned) : [];
    hydrating = false;
    saving.value = 'idle';
    comparison.value = b.published ? await api.comparison(b.published.schedule.id) : null;
  } catch (e: any) {
    errorMsg.value = `加载失败：${e.message}（后端是否已启动？）`;
  }
}

function fromPlanned(p: PlannedItemDto): EditableItem {
  return {
    id: p.id,
    materialId: p.materialId ?? null,
    title: p.title,
    materialType: p.materialType,
    durationSec: p.durationSec,
    overlapSec: p.overlapSec,
    hard: !!p.hardStartAt,
    hardTime: p.hardStartAt ? toTimeInput(p.hardStartAt) : '',
    sourceItemId: p.sourceItemId ?? null,
  };
}

function toUpsert(e: EditableItem): UpsertItem {
  return {
    id: e.id,
    materialId: e.materialId,
    title: e.title,
    materialType: e.materialType,
    durationSec: Math.max(1, Math.round(Number(e.durationSec) || 0)),
    overlapSec: Math.max(0, Math.round(Number(e.overlapSec) || 0)),
    hardStartAt: e.hard && e.hardTime ? fromTimeInput(date.value, e.hardTime) : null,
    sourceItemId: e.sourceItemId,
  };
}

// -------------------------------------------------- 草稿即时重算（边改边看）

const draftTimeline = computed(() => {
  const draft = board.value?.draft;
  if (!draft || draftItems.value.length === 0) return null;
  return computeTimeline(draftItems.value.map(toUpsert), draft.schedule.startAt);
});

/** 与已发布版对照：每个草稿段的开始时间变化（受影响的后续段一眼可见） */
const deltas = computed(() => {
  const map = new Map<string, number | 'new'>();
  const pub = board.value?.published?.timeline.items;
  if (!pub || !draftTimeline.value) return map;
  const pubStart = new Map(pub.map((p) => [p.sourceItemId ?? p.id, p.plannedStartAt]));
  for (const it of draftTimeline.value.items) {
    const key = it.sourceItemId ?? it.id;
    const ref = pubStart.get(key);
    map.set(
      it.id,
      ref === undefined ? 'new' : Math.round((Date.parse(it.plannedStartAt) - Date.parse(ref)) / 1000),
    );
  }
  return map;
});

/** 已发布版中被草稿移除的段数 */
const removedCount = computed(() => {
  const pub = board.value?.published?.timeline.items;
  if (!pub || !draftTimeline.value) return 0;
  const draftKeys = new Set(draftTimeline.value.items.map((i) => i.sourceItemId ?? i.id));
  return pub.filter((p) => !draftKeys.has(p.sourceItemId ?? p.id)).length;
});

// ---------------------------------------------------------------- 保存

watch(
  draftItems,
  () => {
    if (hydrating || !board.value?.draft) return;
    saving.value = 'saving';
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 600);
  },
  { deep: true },
);

async function saveDraft() {
  const draft = board.value?.draft;
  if (!draft) return;
  try {
    await api.saveDraft(draft.schedule.id, draftItems.value.map(toUpsert));
    saving.value = 'saved';
  } catch (e: any) {
    saving.value = 'error';
    errorMsg.value = `保存草稿失败：${e.message}`;
  }
}

// ---------------------------------------------------------------- 操作

function updateItem(index: number, patch: Partial<EditableItem>) {
  const next = draftItems.value.slice();
  next[index] = { ...next[index], ...patch };
  draftItems.value = next;
}

function moveItem(index: number, dir: -1 | 1) {
  const j = index + dir;
  if (j < 0 || j >= draftItems.value.length) return;
  const next = draftItems.value.slice();
  [next[index], next[j]] = [next[j], next[index]];
  draftItems.value = next;
}

function removeItem(index: number) {
  draftItems.value = draftItems.value.filter((_, i) => i !== index);
}

function addItem(materialId: string) {
  const mat = materials.value.find((m) => m.id === materialId);
  if (!mat) return;
  draftItems.value = [
    ...draftItems.value,
    {
      id: crypto.randomUUID(),
      materialId: mat.id,
      title: mat.title,
      materialType: mat.type,
      durationSec: mat.durationSec,
      overlapSec: 0,
      hard: false,
      hardTime: '',
      sourceItemId: null,
    },
  ];
}

async function publish() {
  const draft = board.value?.draft;
  if (!draft || busy.value) return;
  const conflicts = draftTimeline.value?.conflicts.length ?? 0;
  const warn = conflicts ? `\n注意：当前有 ${conflicts} 处硬整点冲突（前序将被硬切）。` : '';
  if (!confirm(`发布草稿将生成新的已发布版本（旧版归档，不会被覆盖）。${warn}\n确认发布？`)) return;
  busy.value = true;
  try {
    const pub = await api.publish(draft.schedule.id);
    notice.value = `已发布 v${pub.schedule.version}，旧版本已归档。`;
    await load();
  } catch (e: any) {
    errorMsg.value = `发布失败：${e.message}`;
  } finally {
    busy.value = false;
  }
}

async function createDraft() {
  const pub = board.value?.published;
  if (!pub) return;
  try {
    await api.createDraft(pub.schedule.id);
    await load();
  } catch (e: any) {
    errorMsg.value = `生成草稿失败：${e.message}`;
  }
}

/** 演示场景：第一段音乐拖长 20s、专题拖长 35s，看偏差如何累积、硬整点如何守时 */
async function simulate() {
  const pub = board.value?.published;
  if (!pub || busy.value) return;
  busy.value = true;
  try {
    const items = pub.timeline.items;
    const overrides: SimOverride[] = (
      [
        { itemId: items.find((i) => i.materialType === 'music')?.id, extraDurationSec: 20 },
        { itemId: items.find((i) => i.title.includes('专题'))?.id, extraDurationSec: 35 },
      ] as { itemId: string | undefined; extraDurationSec: number }[]
    )
      .filter((o) => !!o.itemId)
      .map((o) => ({ itemId: o.itemId!, extraDurationSec: o.extraDurationSec }));
    comparison.value = await api.simulate(pub.schedule.id, overrides);
    notice.value = '已生成模拟播出事件：晨间音乐 +20s、专题 +35s（硬整点应仍准点）。';
  } catch (e: any) {
    errorMsg.value = `模拟播出失败：${e.message}`;
  } finally {
    busy.value = false;
  }
}

async function clearEvents() {
  const pub = board.value?.published;
  if (!pub) return;
  await api.clearEvents(pub.schedule.id);
  comparison.value = await api.comparison(pub.schedule.id);
  notice.value = '已清除模拟播出事件。';
}

watch(date, load);
onMounted(load);
</script>

<template>
  <div class="page">
    <header class="topbar">
      <div class="brand">
        <span class="logo">◉</span>
        <h1>整点新闻播出工作台</h1>
        <span class="sub">节目轨道 · 计划/实际对照 · 时间账</span>
      </div>
      <div class="actions">
        <label class="date-picker">
          播出日
          <input type="date" v-model="date" />
        </label>
        <template v-if="board?.published">
          <span class="tag published">已发布 v{{ board.published.schedule.version }}</span>
        </template>
        <template v-if="board?.draft">
          <span class="tag draft">草稿编辑中</span>
          <span class="save-state" :class="saving">
            {{ { idle: '', saving: '保存中…', saved: '草稿已保存', error: '保存失败' }[saving] }}
          </span>
          <button class="primary" :disabled="busy" @click="publish">发布草稿</button>
        </template>
        <button v-else-if="board?.published" @click="createDraft">从已发布生成草稿</button>
        <button :disabled="busy || !board?.published" @click="simulate">模拟播出</button>
        <button :disabled="!board?.published" @click="clearEvents">清除事件</button>
      </div>
    </header>

    <div v-if="errorMsg" class="banner error">{{ errorMsg }}</div>
    <div v-if="notice" class="banner ok">{{ notice }}</div>

    <main v-if="board">
      <section class="panel">
        <h2>节目轨道对照</h2>
        <TimelineBoard
          :published="board.published?.timeline ?? null"
          :draft="draftTimeline"
          :comparison="comparison"
        />
        <div class="legend">
          <span><i class="sw hard"></i>硬整点（钉死开播）</span>
          <span><i class="sw ovl"></i>转场重叠</span>
          <span><i class="sw gap"></i>缺口（素材不足）</span>
          <span><i class="sw conflict"></i>冲突（前序超时将被硬切）</span>
        </div>
      </section>

      <section class="panel" v-if="board.draft && draftTimeline">
        <h2>
          草稿节目单
          <small>修改后自动重算后续开始时间并保存；影响列 = 与已发布版的开始时间差</small>
        </h2>
        <ItemEditor
          :items="draftItems"
          :planned="draftTimeline.items"
          :deltas="deltas"
          :materials="materials"
          :removed-count="removedCount"
          :total-gap-sec="draftTimeline.totalGapSec"
          :conflict-count="draftTimeline.conflicts.length"
          @update="updateItem"
          @move="moveItem"
          @remove="removeItem"
          @add="addItem"
        />
      </section>
      <section class="panel empty" v-else-if="board.published">
        <p>当前只有已发布版本。点击「从已发布生成草稿」开始编排，已发布版本不会被直接改动。</p>
      </section>

      <section class="panel" v-if="board.published">
        <h2>计划 vs 模拟播出 <small>偏差 = 实际事件时刻 − 计划时刻</small></h2>
        <ComparisonTable :comparison="comparison" />
      </section>
    </main>
    <main v-else-if="!errorMsg" class="loading">加载中…</main>
  </div>
</template>
