import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Material } from '../entities/material.entity';
import { Schedule } from '../entities/schedule.entity';
import { ScheduleItem } from '../entities/schedule-item.entity';

/**
 * 首次启动写入演示数据（当天 08:00–09:00 节目带），覆盖三个核对样例：
 *  1. 短台标插播：段 3/8 为 10s 台标；
 *  2. 转场叠加：段 4 音乐与台标重叠 5s；
 *  3. 缺少素材：段 9 结束于 08:55:15，距 09:00 硬整点新闻缺 285s。
 */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly log = new Logger('Seed');

  constructor(
    @InjectRepository(Material) private readonly materials: Repository<Material>,
    @InjectRepository(Schedule) private readonly schedules: Repository<Schedule>,
    @InjectRepository(ScheduleItem) private readonly items: Repository<ScheduleItem>,
  ) {}

  async onApplicationBootstrap() {
    if ((await this.materials.count()) > 0) return;

    const [news, musicA, ident, musicB, feature, life, weather, musicC] =
      await this.materials.save([
        this.materials.create({ title: '整点新闻', type: 'news', durationSec: 300 }),
        this.materials.create({ title: '晨间音乐', type: 'music', durationSec: 180 }),
        this.materials.create({ title: '台标ID', type: 'ident', durationSec: 10 }),
        this.materials.create({ title: '音乐精选·民谣', type: 'music', durationSec: 240 }),
        this.materials.create({ title: '专题《城市清晨》', type: 'program', durationSec: 1500 }),
        this.materials.create({ title: '生活资讯', type: 'program', durationSec: 600 }),
        this.materials.create({ title: '天气快报', type: 'weather', durationSec: 180 }),
        this.materials.create({ title: '音乐精选·爵士', type: 'music', durationSec: 300 }),
      ]);

    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    const p = (n: number) => String(n).padStart(2, '0');
    const broadcastDate = `${y}-${p(m + 1)}-${p(d)}`;
    const at = (h: number, min = 0) => new Date(y, m, d, h, min, 0, 0);

    type Row = [Material, number, number, Date | null]; // 素材、时长、重叠、硬整点
    const rows: Row[] = [
      [news, 300, 0, at(8)],
      [musicA, 180, 0, null],
      [ident, 10, 0, null],
      [musicB, 240, 5, null],
      [feature, 1500, 0, null],
      [life, 600, 0, null],
      [weather, 180, 0, null],
      [ident, 10, 0, null],
      [musicC, 300, 0, null],
      [news, 300, 0, at(9)],
    ];
    const makeItems = (scheduleId: string | null, lineage: (string | null)[]) =>
      rows.map(([mat, dur, ovl, hard], i) =>
        this.items.create({
          id: randomUUID(),
          scheduleId: scheduleId ?? undefined,
          position: i,
          materialId: mat.id,
          title: mat.title,
          materialType: mat.type,
          durationSec: dur,
          overlapSec: ovl,
          hardStartAt: hard,
          sourceItemId: lineage[i],
        }),
      );

    // 已发布 v1
    const publishedItems = makeItems(null, rows.map(() => null));
    const published = await this.schedules.save(
      this.schedules.create({
        name: '早间节目带',
        broadcastDate,
        startAt: at(8),
        status: 'published',
        version: 1,
        sourceScheduleId: null,
        publishedAt: new Date(),
        items: publishedItems,
      }),
    );

    // 草稿：从已发布复制，血缘指回已发布段
    const draftItems = makeItems(null, publishedItems.map((it) => it.id));
    await this.schedules.save(
      this.schedules.create({
        name: '早间节目带',
        broadcastDate,
        startAt: at(8),
        status: 'draft',
        version: 1,
        sourceScheduleId: published.id,
        publishedAt: null,
        items: draftItems,
      }),
    );

    this.log.log(`已写入演示数据：${broadcastDate} 08:00–09:00（已发布 v1 + 草稿）`);
  }
}
