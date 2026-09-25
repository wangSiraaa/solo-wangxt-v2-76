<script setup lang="ts">
import { fmtDelta, fmtDur, fmtTime } from '../format';
import type { Comparison } from '../types';

defineProps<{ comparison: Comparison | null }>();

const STATUS_LABEL: Record<string, string> = {
  pending: '未播',
  'on-time': '准点',
  early: '早播',
  late: '晚播',
};
</script>

<template>
  <div v-if="comparison">
    <div class="chips">
      <span class="chip">已播 {{ comparison.summary.started }}/{{ comparison.summary.total }}</span>
      <span class="chip late" v-if="comparison.summary.late">晚播 {{ comparison.summary.late }} 段</span>
      <span class="chip early" v-if="comparison.summary.early">早播 {{ comparison.summary.early }} 段</span>
      <span class="chip ontime" v-if="comparison.summary.onTime">准点 {{ comparison.summary.onTime }} 段</span>
      <span class="chip">最大偏差 {{ comparison.summary.maxAbsStartDeviationSec }}s</span>
      <span
        v-for="h in comparison.summary.hardItems"
        :key="h.itemId"
        class="chip hard"
        :class="{ bad: h.startDeviationSec !== null && h.startDeviationSec !== 0 }"
      >
        ⏰ {{ h.title }}：{{ h.startDeviationSec === null ? '未播' : fmtDelta(h.startDeviationSec) }}
      </span>
    </div>

    <table v-if="comparison.rows.length">
      <thead>
        <tr>
          <th>节目段</th>
          <th>计划开始</th>
          <th>实际开始</th>
          <th>开始偏差</th>
          <th>计划时长</th>
          <th>实际时长</th>
          <th>结束偏差</th>
          <th>状态</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in comparison.rows" :key="row.itemId" :class="{ hard: !!row.hardStartAt }">
          <td>{{ row.hardStartAt ? '⏰ ' : '' }}{{ row.title }}</td>
          <td class="t">{{ fmtTime(row.plannedStartAt) }}</td>
          <td class="t">{{ fmtTime(row.actualStartAt) }}</td>
          <td class="t" :class="row.status">{{ fmtDelta(row.startDeviationSec) }}</td>
          <td class="t">{{ fmtDur(row.plannedDurationSec) }}</td>
          <td class="t">{{ fmtDur(row.actualDurationSec) }}</td>
          <td class="t">{{ fmtDelta(row.endDeviationSec) }}</td>
          <td><span class="status" :class="row.status">{{ STATUS_LABEL[row.status] }}</span></td>
        </tr>
      </tbody>
    </table>
    <p v-if="comparison.summary.started === 0" class="empty">
      暂无模拟播出事件 —— 点击右上角「模拟播出」生成一组（音乐 +20s、专题 +35s），或用 POST /api/events 逐条注入。
    </p>
  </div>
  <p v-else class="empty">暂无对照数据。</p>
</template>

<style scoped>
.chips {
  margin-bottom: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 12px;
  background: #1a2238;
  border: 1px solid #2b3852;
  color: #c3d1f2;
}
.chip.late { background: #5b3a1f; color: #ffc98a; border-color: #8a5a2b; }
.chip.early { background: #1f4b5b; color: #9ae2ff; border-color: #2b5f8a; }
.chip.ontime { background: #1f4b3a; color: #a9ecd2; border-color: #2c7a5b; }
.chip.hard { border-color: #ff3355; }
.chip.hard.bad { background: #5b1f2a; color: #ffb3bc; }
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
}
tr.hard td {
  background: rgba(255, 51, 85, 0.06);
}
.t {
  font-variant-numeric: tabular-nums;
  color: #c3d1f2;
}
td.late { color: #ffc98a; font-weight: 700; }
td.early { color: #9ae2ff; font-weight: 700; }
td.on-time { color: #a9ecd2; }
.status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: #2b3852;
  color: #c3d1f2;
}
.status.on-time { background: #1f4b3a; color: #a9ecd2; }
.status.late { background: #5b3a1f; color: #ffc98a; }
.status.early { background: #1f4b5b; color: #9ae2ff; }
.empty {
  color: #5a6a92;
  font-size: 13px;
  padding: 8px 2px;
}
</style>
