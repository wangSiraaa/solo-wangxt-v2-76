import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { newDb } from 'pg-mem';
import { randomUUID } from 'crypto';
import { createAppModule } from '../src/app.module';
import { ENTITIES } from '../src/data-source';

/**
 * 全链路核对（pg-mem 内存 PostgreSQL）：
 * 种子数据 → 草稿编辑（短台标插播/转场叠加/缺少素材）→ 发布版本隔离 → 模拟事件对照。
 */
describe('播出工作台 API（端到端）', () => {
  let app: INestApplication;
  let base: string;

  const req = async (path: string, init?: RequestInit) => {
    const res = await fetch(`${base}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  };

  const today = () => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const localIso = (h: number, m = 0, s = 0) => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, s).toISOString();
  };

  beforeAll(async () => {
    const db = newDb();
    // TypeORM 连接时会探测版本/当前库/当前 schema，pg-mem 需手动注册
    db.public.registerFunction({
      name: 'version',
      returns: 'text' as any,
      implementation: () => 'PostgreSQL 16.0 (pg-mem)',
    });
    db.public.registerFunction({
      name: 'current_database',
      returns: 'text' as any,
      implementation: () => 'broadcast',
    });
    db.public.registerFunction({
      name: 'current_schema',
      returns: 'text' as any,
      implementation: () => 'public',
    });
    const moduleRef = await Test.createTestingModule({
      imports: [
        createAppModule(
          { type: 'postgres', entities: ENTITIES, synchronize: true },
          async () =>
            db.adapters.createTypeormDataSource({
              type: 'postgres',
              entities: ENTITIES,
              synchronize: true,
            } as any),
        ),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    const addr = app.getHttpServer().address();
    base = `http://127.0.0.1:${addr.port}/api`;
  });

  afterAll(async () => {
    await app?.close();
  });

  let board: any;
  let draftItems: any[];

  it('种子数据：已发布 v1 + 草稿，含转场叠加 5s 与 285s 缺口', async () => {
    const { status, body } = await req(`/schedules/board?date=${today()}`);
    expect(status).toBe(200);
    board = body;
    expect(board.published.schedule.version).toBe(1);
    expect(board.draft).toBeTruthy();

    const items = board.published.timeline.items;
    expect(items).toHaveLength(10);
    // 样例·转场叠加：第 4 段音乐与台标重叠 5s
    expect(items[3].title).toBe('音乐精选·民谣');
    expect(items[3].appliedOverlapSec).toBe(5);
    // 样例·缺少素材：09:00 硬整点新闻前缺口 285s，且整点准时
    const last = items[9];
    expect(last.hardStartAt).toBe(localIso(9));
    expect(last.plannedStartAt).toBe(localIso(9));
    expect(last.gapBeforeSec).toBe(285);
    // 草稿段血缘指回已发布段
    expect(board.draft.timeline.items[0].sourceItemId).toBe(items[0].id);

    draftItems = board.draft.timeline.items.map((p: any) => ({
      id: p.id,
      materialId: p.materialId,
      title: p.title,
      materialType: p.materialType,
      durationSec: p.durationSec,
      overlapSec: p.overlapSec,
      hardStartAt: p.hardStartAt,
      sourceItemId: p.sourceItemId,
    }));
  });

  it('样例1·短台标插播：草稿插入 10s 台标，后续开始 +10s', async () => {
    const before = board.draft.timeline.items;
    const musicB = before[3];
    const inserted = {
      id: randomUUID(),
      materialId: null,
      title: '台标ID',
      materialType: 'ident',
      durationSec: 10,
      overlapSec: 0,
      hardStartAt: null,
      sourceItemId: null,
    };
    draftItems.splice(2, 0, inserted);
    const { status, body } = await req(`/schedules/${board.draft.schedule.id}/items`, {
      method: 'PUT',
      body: JSON.stringify({ items: draftItems }),
    });
    expect(status).toBe(200);
    const items = body.timeline.items;
    expect(items).toHaveLength(11);
    expect(items[2].plannedStartAt).toBe(localIso(8, 8, 0));
    // 原第 4 段（音乐精选·民谣）从 08:08:05 推到 08:08:15
    expect(musicB.plannedStartAt).toBe(localIso(8, 8, 5));
    expect(items[4].id).toBe(musicB.id);
    expect(items[4].plannedStartAt).toBe(localIso(8, 8, 15));
    draftItems = items.map(strip);
  });

  it('样例2·转场叠加：给台标后续段设 3s 重叠，开始时间回叠', async () => {
    draftItems[3].overlapSec = 3; // 第二段台标与前一段重叠 3s
    const { status, body } = await req(`/schedules/${board.draft.schedule.id}/items`, {
      method: 'PUT',
      body: JSON.stringify({ items: draftItems }),
    });
    expect(status).toBe(200);
    const items = body.timeline.items;
    expect(items[3].appliedOverlapSec).toBe(3);
    expect(items[3].plannedStartAt).toBe(localIso(8, 8, 7));
    expect(items[4].plannedStartAt).toBe(localIso(8, 8, 12)); // 民谣：08:08:17 - 5s 重叠
    draftItems = items.map(strip);
  });

  it('样例3·缺少素材：撤下一段音乐，缺口变大但 09:00 新闻不晚播', async () => {
    const idx = draftItems.findIndex((i) => i.title === '音乐精选·爵士');
    expect(idx).toBeGreaterThan(0);
    draftItems.splice(idx, 1);
    const { status, body } = await req(`/schedules/${board.draft.schedule.id}/items`, {
      method: 'PUT',
      body: JSON.stringify({ items: draftItems }),
    });
    expect(status).toBe(200);
    const last = body.timeline.items.at(-1);
    expect(last.title).toBe('整点新闻');
    expect(last.plannedStartAt).toBe(localIso(9)); // 硬整点不动
    expect(last.gapBeforeSec).toBe(578); // 08:50:22 → 09:00:00
    expect(body.timeline.totalGapSec).toBe(578);
    draftItems = body.timeline.items.map(strip);
  });

  it('发布：生成 v2，旧版归档，草稿不被覆盖、已发布不被草稿直接改动', async () => {
    const draftId = board.draft.schedule.id;
    const { status, body } = await req(`/schedules/${draftId}/publish`, { method: 'POST' });
    expect(status).toBe(201);
    expect(body.schedule.version).toBe(2);
    expect(body.schedule.status).toBe('published');

    const b2 = (await req(`/schedules/board?date=${today()}`)).body;
    expect(b2.published.schedule.version).toBe(2);
    expect(b2.published.timeline.items).toHaveLength(10);
    expect(b2.draft).toBeTruthy(); // 草稿仍在

    // 再改草稿（专题 +100s），已发布 v2 的时间账必须保持不变
    draftItems = b2.draft.timeline.items.map(strip);
    const feature = draftItems.find((i: any) => i.title.includes('专题'))!;
    feature.durationSec += 100;
    await req(`/schedules/${b2.draft.schedule.id}/items`, {
      method: 'PUT',
      body: JSON.stringify({ items: draftItems }),
    });
    const b3 = (await req(`/schedules/board?date=${today()}`)).body;
    const pubFeature = b3.published.timeline.items.find((i: any) => i.title.includes('专题'))!;
    expect(pubFeature.durationSec).toBe(1500); // 已发布未被草稿覆盖
    board = b3;
  });

  it('禁止直接改已发布节目单', async () => {
    const { status } = await req(`/schedules/${board.published.schedule.id}/items`, {
      method: 'PUT',
      body: JSON.stringify({
        items: [
          {
            title: 'x',
            materialType: 'program',
            durationSec: 60,
            overlapSec: 0,
          },
        ],
      }),
    });
    expect(status).toBe(400);
  });

  it('生成草稿：同日已有草稿时复用而不新建', async () => {
    const { status, body } = await req(`/schedules/${board.published.schedule.id}/draft`, {
      method: 'POST',
    });
    expect(status).toBe(201);
    expect(body.schedule.id).toBe(board.draft.schedule.id);
    expect(body.schedule.status).toBe('draft');
  });

  it('手动注入播出事件：偏差计入对照表', async () => {
    const pub = board.published;
    const first = pub.timeline.items[0];
    const late7 = new Date(Date.parse(first.plannedStartAt) + 7000).toISOString();
    const { status } = await req('/events', {
      method: 'POST',
      body: JSON.stringify({
        scheduleId: pub.schedule.id,
        itemId: first.id,
        type: 'start',
        occurredAt: late7,
      }),
    });
    expect(status).toBe(201);

    const cmp = (await req(`/schedules/${pub.schedule.id}/comparison`)).body;
    expect(cmp.rows[0].startDeviationSec).toBe(7);
    expect(cmp.rows[0].status).toBe('late');
    expect(cmp.rows[1].status).toBe('pending');

    await req(`/events?scheduleId=${pub.schedule.id}`, { method: 'DELETE' });
    const cleared = (await req(`/schedules/${pub.schedule.id}/comparison`)).body;
    expect(cleared.rows.every((r: any) => r.status === 'pending')).toBe(true);
  });

  it('模拟播出：音乐/专题超时沿软段累积，09:00 硬整点新闻准点', async () => {
    const pub = board.published;
    const items = pub.timeline.items;
    const folk = items.find((i: any) => i.title === '音乐精选·民谣')!;
    const feature = items.find((i: any) => i.title.includes('专题'))!;
    const { status, body } = await req(`/schedules/${pub.schedule.id}/simulate`, {
      method: 'POST',
      body: JSON.stringify({
        overrides: [
          { itemId: folk.id, extraDurationSec: 20 },
          { itemId: feature.id, extraDurationSec: 35 },
        ],
      }),
    });
    expect(status).toBe(201);
    const rows = body.rows;
    const byTitle = (t: string) => rows.find((r: any) => r.title === t);

    expect(byTitle('音乐精选·民谣').endDeviationSec).toBe(20);
    expect(byTitle('专题《城市清晨》').startDeviationSec).toBe(20); // 被音乐拖晚
    expect(byTitle('生活资讯').startDeviationSec).toBe(55); // 20 + 35 累积
    const hardNews = rows.filter((r: any) => r.hardStartAt).at(-1);
    expect(hardNews.startDeviationSec).toBe(0); // 硬整点不晚播
    expect(hardNews.status).toBe('on-time');
    expect(body.summary.maxAbsStartDeviationSec).toBe(55);
  });
});

function strip(p: any) {
  return {
    id: p.id,
    materialId: p.materialId ?? null,
    title: p.title,
    materialType: p.materialType,
    durationSec: p.durationSec,
    overlapSec: p.overlapSec,
    hardStartAt: p.hardStartAt ?? null,
    sourceItemId: p.sourceItemId ?? null,
  };
}
