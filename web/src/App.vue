<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api } from './api';
import { parseHMS } from '@shared/timeline';
import RundownEditor from './components/RundownEditor.vue';
import CompareView from './components/CompareView.vue';

const tab = ref<'draft' | 'compare'>('draft');
const rundowns = ref<any[]>([]);
const materials = ref<any[]>([]);
const draftDetail = ref<any>(null);
const error = ref('');

const drafts = computed(() => rundowns.value.filter((r) => r.status === 'draft'));
const published = computed(() => rundowns.value.filter((r) => r.status === 'published'));
const currentDraftId = ref<number | null>(null);

const newName = ref('晚间板块节目单');
const newDate = ref(new Date().toISOString().slice(0, 10));
const newStart = ref('18:00');

async function reload() {
  error.value = '';
  try {
    [rundowns.value, materials.value] = await Promise.all([api.rundowns(), api.materials()]);
    if (!currentDraftId.value && drafts.value.length) currentDraftId.value = drafts.value[0].id;
    draftDetail.value = currentDraftId.value ? await api.rundown(currentDraftId.value) : null;
  } catch (e: any) {
    error.value = e.message;
  }
}

async function selectDraft(id: number) {
  currentDraftId.value = id;
  draftDetail.value = await api.rundown(id);
}

async function createDraft() {
  const dayStartSec = parseHMS(newStart.value);
  if (dayStartSec == null) { error.value = '开播时间格式应为 HH:MM'; return; }
  try {
    const r = await api.createDraft({ name: newName.value, broadcastDate: newDate.value, dayStartSec });
    await reload();
    await selectDraft(r.id);
  } catch (e: any) {
    error.value = e.message;
  }
}

onMounted(reload);
</script>

<template>
  <h1>整点新闻节目单工作台</h1>
  <p class="sub">
    草稿编排 → 时间账即时重算 → 发布只读版本 → 模拟播出事件对照。硬整点新闻锚定整点，不被前序音乐转场拖延。
  </p>

  <div class="tabs">
    <button :class="{ active: tab === 'draft' }" @click="tab = 'draft'">草稿编排</button>
    <button :class="{ active: tab === 'compare' }" @click="tab = 'compare'">
      发布与对照<span v-if="published.length">（{{ published.length }} 个已发布版本）</span>
    </button>
  </div>

  <div v-if="tab === 'draft'">
    <div class="panel">
      <div class="toolbar">
        <span class="hint">选择草稿：</span>
        <button v-for="d in drafts" :key="d.id" class="act"
                :style="d.id === currentDraftId ? 'border-color:#0969da;font-weight:600' : ''"
                @click="selectDraft(d.id)">
          {{ d.name }} · {{ d.broadcast_date }}
        </button>
        <span style="flex:1"></span>
        <form class="inline" @submit.prevent="createDraft">
          <input v-model="newName" placeholder="新草稿名称" />
          <input v-model="newDate" type="date" />
          <input v-model="newStart" placeholder="开播 HH:MM" style="width:110px" />
          <button class="act" type="submit">新建草稿</button>
        </form>
      </div>
    </div>

    <RundownEditor v-if="draftDetail" :rundown="draftDetail" :materials="materials" @changed="reload" />
    <p v-else class="hint">暂无草稿，请先新建。</p>
  </div>

  <div v-else>
    <CompareView :published="published" />
    <div class="panel">
      <h2>已发布版本（只读，草稿修改不会覆盖）</h2>
      <table v-if="published.length">
        <thead><tr><th>ID</th><th>名称</th><th>日期</th><th>版本</th><th>段数</th><th>发布时间</th></tr></thead>
        <tbody>
          <tr v-for="r in published" :key="r.id">
            <td class="mono">{{ r.id }}</td>
            <td>{{ r.name }}</td>
            <td>{{ r.broadcast_date }}</td>
            <td class="mono">v{{ r.version }}</td>
            <td class="mono">{{ r.segment_count }}</td>
            <td class="mono">{{ new Date(r.created_at).toLocaleString('zh-CN') }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="hint">尚无已发布版本。</p>
    </div>
  </div>

  <p v-if="error" class="err">{{ error }}</p>
</template>
