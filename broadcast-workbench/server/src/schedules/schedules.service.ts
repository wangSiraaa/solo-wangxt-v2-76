import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Schedule } from '../entities/schedule.entity';
import { ScheduleItem } from '../entities/schedule-item.entity';
import { BroadcastEvent } from '../entities/broadcast-event.entity';
import {
  compareWithEvents,
  computeTimeline,
  simulatePlayout,
  TimelineItemInput,
  TimelineResult,
} from '../common/timeline';
import { ReplaceItemsDto, SimulateDto } from '../dto';

export interface ScheduleBundle {
  schedule: {
    id: string;
    name: string;
    broadcastDate: string;
    startAt: string;
    status: string;
    version: number;
    publishedAt: string | null;
  };
  timeline: TimelineResult;
}

const iso = (v: Date | string | null | undefined): string | null =>
  v ? new Date(v).toISOString() : null;

@Injectable()
export class SchedulesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Schedule) private readonly schedules: Repository<Schedule>,
    @InjectRepository(ScheduleItem) private readonly items: Repository<ScheduleItem>,
    @InjectRepository(BroadcastEvent) private readonly events: Repository<BroadcastEvent>,
  ) {}

  /** 工作台主面板：某播出日的已发布版 + 草稿版（各自带时间账） */
  async getBoard(date: string) {
    const schedules = await this.schedules.find({ where: { broadcastDate: date } });
    const published = schedules.find((s) => s.status === 'published') ?? null;
    const draft = schedules.find((s) => s.status === 'draft') ?? null;
    return {
      date,
      published: published ? this.toBundle(published) : null,
      draft: draft ? this.toBundle(draft) : null,
    };
  }

  /** 从某个节目单（通常是已发布版）生成草稿；同日已有草稿则直接返回 */
  async createDraftFrom(scheduleId: string): Promise<ScheduleBundle> {
    const src = await this.schedules.findOne({ where: { id: scheduleId } });
    if (!src) throw new NotFoundException('节目单不存在');
    const existing = await this.schedules.findOne({
      where: { broadcastDate: src.broadcastDate, status: 'draft' },
    });
    if (existing) return this.toBundle(existing);

    const draft = this.schedules.create({
      name: src.name,
      broadcastDate: src.broadcastDate,
      startAt: src.startAt,
      status: 'draft',
      version: src.version,
      sourceScheduleId: src.id,
      publishedAt: null,
      items: this.sorted(src).map((it, i) =>
        this.items.create({
          id: randomUUID(),
          position: i,
          materialId: it.materialId,
          title: it.title,
          materialType: it.materialType,
          durationSec: it.durationSec,
          overlapSec: it.overlapSec,
          hardStartAt: it.hardStartAt,
          sourceItemId: it.sourceItemId ?? it.id, // 血缘：指向已发布段
        }),
      ),
    });
    const saved = await this.schedules.save(draft);
    return this.toBundle(await this.mustFind(saved.id));
  }

  /** 整体替换草稿的节目段（只允许草稿；已发布版本不会被草稿直接覆盖） */
  async replaceDraftItems(draftId: string, dto: ReplaceItemsDto): Promise<ScheduleBundle> {
    const draft = await this.schedules.findOne({ where: { id: draftId } });
    if (!draft) throw new NotFoundException('节目单不存在');
    if (draft.status !== 'draft') {
      throw new BadRequestException('只能编辑草稿节目单；已发布版本需通过「发布」产生新版本');
    }

    await this.items.delete({ scheduleId: draft.id });
    const rows = dto.items.map((it, i) =>
      this.items.create({
        id: it.id ?? randomUUID(),
        scheduleId: draft.id,
        position: i,
        materialId: it.materialId ?? null,
        title: it.title,
        materialType: it.materialType,
        durationSec: it.durationSec,
        overlapSec: it.overlapSec,
        hardStartAt: it.hardStartAt ? new Date(it.hardStartAt) : null,
        sourceItemId: it.sourceItemId ?? null,
      }),
    );
    await this.items.save(rows);
    return this.toBundle(await this.mustFind(draft.id));
  }

  /** 发布：归档当前已发布版，以草稿内容生成 version+1 的新已发布版（草稿原样保留） */
  async publish(draftId: string): Promise<ScheduleBundle> {
    return this.dataSource.transaction(async (em) => {
      const draft = await em.findOne(Schedule, { where: { id: draftId } });
      if (!draft) throw new NotFoundException('节目单不存在');
      if (draft.status !== 'draft') throw new BadRequestException('只有草稿可以发布');

      const current = await em.findOne(Schedule, {
        where: { broadcastDate: draft.broadcastDate, status: 'published' },
      });
      let version = 1;
      if (current) {
        current.status = 'archived';
        await em.save(current);
        version = current.version + 1;
      }

      const published = em.create(Schedule, {
        id: randomUUID(),
        name: draft.name,
        broadcastDate: draft.broadcastDate,
        startAt: draft.startAt,
        status: 'published',
        version,
        sourceScheduleId: null,
        publishedAt: new Date(),
        items: this.sorted(draft).map((it, i) =>
          em.create(ScheduleItem, {
            id: randomUUID(),
            position: i,
            materialId: it.materialId,
            title: it.title,
            materialType: it.materialType,
            durationSec: it.durationSec,
            overlapSec: it.overlapSec,
            hardStartAt: it.hardStartAt,
            sourceItemId: it.sourceItemId ?? it.id, // 血缘延续，便于下一版对照
          }),
        ),
      });
      const saved = await em.save(published);
      const fresh = await em.findOne(Schedule, { where: { id: saved.id } });
      return this.toBundle(fresh!);
    });
  }

  /** 计划 vs 模拟播出事件对照（针对已发布节目单） */
  async getComparison(scheduleId: string) {
    const schedule = await this.mustFind(scheduleId);
    const timeline = this.timelineOf(schedule);
    const events = await this.events.find({
      where: { scheduleId },
      order: { occurredAt: 'ASC' },
    });
    const rows = compareWithEvents(
      timeline.items,
      events.map((e) => ({
        itemId: e.itemId,
        type: e.type,
        occurredAt: new Date(e.occurredAt).toISOString(),
      })),
    );
    const deviations = rows
      .map((r) => r.startDeviationSec)
      .filter((v): v is number => v !== null)
      .map(Math.abs);
    return {
      scheduleId,
      rows,
      summary: {
        total: rows.length,
        started: rows.filter((r) => r.actualStartAt).length,
        late: rows.filter((r) => r.status === 'late').length,
        early: rows.filter((r) => r.status === 'early').length,
        onTime: rows.filter((r) => r.status === 'on-time').length,
        pending: rows.filter((r) => r.status === 'pending').length,
        maxAbsStartDeviationSec: deviations.length ? Math.max(...deviations) : 0,
        hardItems: rows
          .filter((r) => r.hardStartAt)
          .map((r) => ({ itemId: r.itemId, title: r.title, startDeviationSec: r.startDeviationSec })),
      },
    };
  }

  /** 模拟播出：生成一组播出事件（默认准点；可用 overrides 注入超时/延迟） */
  async simulate(scheduleId: string, dto: SimulateDto) {
    const schedule = await this.mustFind(scheduleId);
    if (schedule.status !== 'published') {
      throw new BadRequestException('只能对已发布节目单做模拟播出');
    }
    const timeline = this.timelineOf(schedule);
    const events = simulatePlayout(timeline.items, dto.overrides ?? []);
    await this.events.delete({ scheduleId });
    await this.events.save(
      events.map((e) =>
        this.events.create({
          scheduleId,
          itemId: e.itemId,
          type: e.type,
          occurredAt: new Date(e.occurredAt),
        }),
      ),
    );
    return this.getComparison(scheduleId);
  }

  // -------------------------------------------------------------------------

  private sorted(s: Schedule): ScheduleItem[] {
    return [...(s.items ?? [])].sort((a, b) => a.position - b.position);
  }

  private timelineOf(s: Schedule): TimelineResult {
    const inputs: TimelineItemInput[] = this.sorted(s).map((it) => ({
      id: it.id,
      title: it.title,
      materialType: it.materialType,
      durationSec: it.durationSec,
      overlapSec: it.overlapSec,
      hardStartAt: iso(it.hardStartAt),
      sourceItemId: it.sourceItemId,
      materialId: it.materialId,
      position: it.position,
    }));
    return computeTimeline(inputs, new Date(s.startAt).toISOString());
  }

  private toBundle(s: Schedule): ScheduleBundle {
    return {
      schedule: {
        id: s.id,
        name: s.name,
        broadcastDate: s.broadcastDate,
        startAt: new Date(s.startAt).toISOString(),
        status: s.status,
        version: s.version,
        publishedAt: iso(s.publishedAt),
      },
      timeline: this.timelineOf(s),
    };
  }

  private async mustFind(id: string): Promise<Schedule> {
    const s = await this.schedules.findOne({ where: { id } });
    if (!s) throw new NotFoundException('节目单不存在');
    return s;
  }
}
