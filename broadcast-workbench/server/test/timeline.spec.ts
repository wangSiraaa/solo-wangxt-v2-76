import { describe, expect, it } from 'vitest';
import {
  compareWithEvents,
  computeTimeline,
  simulatePlayout,
  TimelineItemInput,
} from '../src/common/timeline';

const T = (s: string) => `2026-09-25T${s}.000Z`;
const START = T('08:00:00');

let seq = 0;
const item = (partial: Partial<TimelineItemInput> & { durationSec: number }): TimelineItemInput => ({
  id: `it-${++seq}`,
  title: partial.title ?? `段${seq}`,
  materialType: partial.materialType ?? 'program',
  durationSec: partial.durationSec,
  overlapSec: partial.overlapSec ?? 0,
  hardStartAt: partial.hardStartAt ?? null,
});

describe('时间账：计划时间计算', () => {
  it('普通节目段顺序累加时长', () => {
    const r = computeTimeline(
      [item({ durationSec: 300 }), item({ durationSec: 180 }), item({ durationSec: 600 })],
      START,
    );
    expect(r.items.map((i) => i.plannedStartAt)).toEqual([T('08:00:00'), T('08:05:00'), T('08:08:00')]);
    expect(r.endAt).toBe(T('08:18:00'));
    expect(r.totalGapSec).toBe(0);
    expect(r.conflicts).toHaveLength(0);
  });

  it('样例1·短台标插播：插入 10s 台标，后续开始时间整体 +10s', () => {
    const withoutIdent = computeTimeline(
      [item({ durationSec: 300, hardStartAt: T('08:00:00') }), item({ durationSec: 180 }), item({ durationSec: 240 })],
      START,
    );
    expect(withoutIdent.items[2].plannedStartAt).toBe(T('08:08:00'));

    const withIdent = computeTimeline(
      [
        item({ durationSec: 300, hardStartAt: T('08:00:00') }),
        item({ durationSec: 180 }),
        item({ durationSec: 10, materialType: 'ident', title: '台标ID' }),
        item({ durationSec: 240 }),
      ],
      START,
    );
    expect(withIdent.items[2].plannedStartAt).toBe(T('08:08:00'));
    expect(withIdent.items[3].plannedStartAt).toBe(T('08:08:10')); // 08:08:00 + 10s
    expect(withIdent.items[3].plannedEndAt).toBe(T('08:12:10'));
  });

  it('样例2·转场叠加：音乐与台标重叠 5s，净影响只有 +5s', () => {
    const r = computeTimeline(
      [
        item({ durationSec: 300, hardStartAt: T('08:00:00') }),
        item({ durationSec: 180 }),
        item({ durationSec: 10, materialType: 'ident' }),
        item({ durationSec: 240, materialType: 'music', overlapSec: 5 }),
      ],
      START,
    );
    const music = r.items[3];
    expect(music.appliedOverlapSec).toBe(5);
    expect(music.plannedStartAt).toBe(T('08:08:05')); // 台标 08:08:10 结束，回叠 5s
    expect(music.plannedEndAt).toBe(T('08:12:05'));
  });

  it('转场重叠被钳制在上一段时长内', () => {
    const r = computeTimeline(
      [item({ durationSec: 10, materialType: 'ident' }), item({ durationSec: 240, overlapSec: 999 })],
      START,
    );
    expect(r.items[1].appliedOverlapSec).toBe(10);
    expect(r.items[1].plannedStartAt).toBe(T('08:00:00'));
  });

  it('样例3·缺少素材：硬整点前出现缺口，且整点新闻仍准点开播', () => {
    const r = computeTimeline(
      [
        item({ durationSec: 300, hardStartAt: T('08:00:00') }),
        item({ durationSec: 180, materialType: 'music' }),
        item({ durationSec: 300, hardStartAt: T('09:00:00'), materialType: 'news', title: '整点新闻' }),
      ],
      START,
    );
    const news = r.items[2];
    expect(news.plannedStartAt).toBe(T('09:00:00')); // 不晚播
    expect(news.gapBeforeSec).toBe(3120); // 08:08:00 → 09:00:00 缺 52 分钟
    expect(r.totalGapSec).toBe(3120);
  });

  it('硬整点冲突：前序超时冲入整点，记冲突且整点不推迟', () => {
    const r = computeTimeline(
      [
        item({ durationSec: 300, hardStartAt: T('08:00:00') }),
        item({ durationSec: 3600 }), // 08:05:00 + 60min = 09:05:00，冲入整点 5 分钟
        item({ durationSec: 300, hardStartAt: T('09:00:00'), materialType: 'news' }),
        item({ durationSec: 60 }),
      ],
      START,
    );
    const news = r.items[2];
    expect(news.plannedStartAt).toBe(T('09:00:00'));
    expect(news.overrunBeforeSec).toBe(300);
    expect(r.conflicts).toEqual([{ itemId: news.id, itemTitle: news.title, overrunSec: 300 }]);
    // 后续段从硬整点结束处继续排
    expect(r.items[3].plannedStartAt).toBe(T('09:05:00'));
  });

  it('首段无硬整点时从节目带起点开始', () => {
    const r = computeTimeline([item({ durationSec: 60 })], START);
    expect(r.items[0].plannedStartAt).toBe(START);
  });
});

describe('时间账：计划 vs 模拟播出事件', () => {
  const planned = computeTimeline(
    [
      item({ durationSec: 300, hardStartAt: T('08:00:00'), title: '整点新闻' }),
      item({ durationSec: 180, materialType: 'music', title: '音乐' }),
      item({ durationSec: 60, title: '资讯' }),
    ],
    START,
  ).items;

  it('晚播/早播/准点/未播判定', () => {
    const rows = compareWithEvents(planned, [
      { itemId: planned[0].id, type: 'start', occurredAt: T('08:00:05') }, // 晚 5s
      { itemId: planned[0].id, type: 'end', occurredAt: T('08:05:05') },
      { itemId: planned[1].id, type: 'start', occurredAt: T('08:04:57') }, // 早 3s
      { itemId: planned[2].id, type: 'start', occurredAt: T('08:08:01') }, // 容差内
    ]);
    expect(rows[0].status).toBe('late');
    expect(rows[0].startDeviationSec).toBe(5);
    expect(rows[0].actualDurationSec).toBe(300);
    expect(rows[1].status).toBe('early');
    expect(rows[1].startDeviationSec).toBe(-3);
    expect(rows[2].status).toBe('on-time');
    expect(rows[2].actualEndAt).toBeNull(); // 只有 start 事件
  });

  it('无事件时为 pending', () => {
    const rows = compareWithEvents(planned, []);
    expect(rows.every((r) => r.status === 'pending')).toBe(true);
  });
});

describe('模拟播出：超时沿软段累积，硬整点准点切回', () => {
  it('音乐拖长 30s 后，硬整点新闻仍 09:00 开播', () => {
    const planned = computeTimeline(
      [
        item({ durationSec: 300, hardStartAt: T('08:00:00'), materialType: 'news' }),
        item({ durationSec: 180, materialType: 'music', title: '音乐' }),
        item({ durationSec: 300, hardStartAt: T('09:00:00'), materialType: 'news', title: '整点新闻' }),
      ],
      START,
    ).items;
    const events = simulatePlayout(planned, [
      { itemId: planned[1].id, extraDurationSec: 30 },
    ]);
    const startOf = (id: string) =>
      events.find((e) => e.itemId === id && e.type === 'start')!.occurredAt;
    const endOf = (id: string) =>
      events.find((e) => e.itemId === id && e.type === 'end')!.occurredAt;

    expect(endOf(planned[1].id)).toBe(T('08:08:30')); // 音乐实际拖长 30s
    expect(startOf(planned[2].id)).toBe(T('09:00:00')); // 硬整点不晚播

    const rows = compareWithEvents(planned, events);
    expect(rows[1].endDeviationSec).toBe(30);
    expect(rows[2].startDeviationSec).toBe(0);
    expect(rows[2].status).toBe('on-time');
  });
});
