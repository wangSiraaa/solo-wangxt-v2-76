import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from './database.service.js';
import {
  comparePlan,
  computeTimeline,
  type BroadcastEvent,
  type CompareRow,
  type SegmentInput,
  type SegmentTiming,
} from '../shared/timeline.js';

interface SegmentRow {
  id: number;
  rundown_id: number;
  position: number;
  title: string;
  kind: string;
  planned_duration_sec: number;
  overlap_next_sec: number;
  hard_top: boolean;
  fixed_start_sec: number | null;
  material_id: number | null;
  material_title: string | null;
  material_duration_sec: number | null;
  notes: string;
}

export interface SegmentPayload {
  title: string;
  kind: string;
  plannedDurationSec: number;
  overlapNextSec: number;
  hardTop: boolean;
  fixedStartSec: number | null;
  materialId: number | null;
  notes?: string;
}

const SEGMENT_SELECT = `
  SELECT s.*, m.title AS material_title, m.duration_sec AS material_duration_sec
  FROM segments s LEFT JOIN materials m ON m.id = s.material_id
  WHERE s.rundown_id = $1 ORDER BY s.position`;

function toInput(row: SegmentRow): SegmentInput {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind as SegmentInput['kind'],
    plannedDurationSec: row.planned_duration_sec,
    overlapNextSec: row.overlap_next_sec,
    hardTop: row.hard_top,
    fixedStartSec: row.fixed_start_sec,
    materialDurationSec: row.material_duration_sec,
  };
}

@Injectable()
export class RundownsService {
  constructor(private readonly db: DatabaseService) {}

  listMaterials() {
    return this.db.query('SELECT * FROM materials ORDER BY id');
  }

  listRundowns() {
    return this.db.query(
      `SELECT r.*, (SELECT COUNT(*)::int FROM segments s WHERE s.rundown_id = r.id) AS segment_count
       FROM rundowns r ORDER BY r.broadcast_date, r.name, r.version`,
    );
  }

  async getRundown(id: number) {
    const rows = await this.db.query('SELECT * FROM rundowns WHERE id = $1', [id]);
    if (!rows[0]) throw new NotFoundException(`rundown ${id} not found`);
    const segments: SegmentRow[] = await this.db.query(SEGMENT_SELECT, [id]);
    const timeline = computeTimeline(rows[0].day_start_sec, segments.map(toInput));
    return { ...rows[0], segments, timeline };
  }

  async createDraft(body: { name: string; broadcastDate: string; dayStartSec: number }) {
    if (!body?.name || !body?.broadcastDate || body?.dayStartSec == null) {
      throw new BadRequestException('name / broadcastDate / dayStartSec 必填');
    }
    const rows = await this.db.query(
      `INSERT INTO rundowns(name, broadcast_date, version, status, day_start_sec)
       VALUES ($1,$2,1,'draft',$3) RETURNING *`,
      [body.name, body.broadcastDate, body.dayStartSec],
    );
    return rows[0];
  }

  /**
   * 整体替换草稿的节目段，返回重算后的时间线与受影响（开始时间变化）的位次。
   * 仅允许作用于 draft；已发布版本不可被草稿覆盖。
   */
  async replaceSegments(id: number, payload: SegmentPayload[]) {
    const rows = await this.db.query('SELECT * FROM rundowns WHERE id = $1', [id]);
    const rundown = rows[0];
    if (!rundown) throw new NotFoundException(`rundown ${id} not found`);
    if (rundown.status !== 'draft') {
      throw new BadRequestException('已发布版本为只读，请修改草稿后重新发布');
    }
    if (!Array.isArray(payload)) throw new BadRequestException('segments 必须是数组');
    for (const [i, s] of payload.entries()) {
      if (!s?.title || !(s.plannedDurationSec > 0)) {
        throw new BadRequestException(`第 ${i + 1} 段缺少标题或计划时长非法`);
      }
      if (s.hardTop && s.fixedStartSec == null) {
        throw new BadRequestException(`第 ${i + 1} 段标记了硬整点但未给固定开始时间`);
      }
    }

    const before: SegmentRow[] = await this.db.query(SEGMENT_SELECT, [id]);
    const beforeTimeline = computeTimeline(rundown.day_start_sec, before.map(toInput));

    const after = await this.db.transaction(async (q) => {
      await q('DELETE FROM segments WHERE rundown_id = $1', [id]);
      for (let i = 0; i < payload.length; i++) {
        const s = payload[i];
        await q(
          `INSERT INTO segments(rundown_id, position, title, kind, planned_duration_sec, overlap_next_sec, hard_top, fixed_start_sec, material_id, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            id, i, s.title, s.kind ?? 'program', s.plannedDurationSec,
            Math.max(0, s.overlapNextSec ?? 0), !!s.hardTop,
            s.hardTop ? s.fixedStartSec : null, s.materialId ?? null, s.notes ?? '',
          ],
        );
      }
      return q(SEGMENT_SELECT, [id]);
    });

    const afterTimeline = computeTimeline(rundown.day_start_sec, after.map(toInput));
    // 按位次对比：开始时刻发生变化的段即为受影响段
    const affectedPositions = afterTimeline
      .map((t: SegmentTiming, i: number) => ({ t, i }))
      .filter(({ t, i }) => !beforeTimeline[i] || beforeTimeline[i].startSec !== t.startSec)
      .map(({ i }) => i);

    return { segments: after, timeline: afterTimeline, affectedPositions };
  }

  /** 发布：把当前草稿复制为新的只读版本，草稿本身保持不变 */
  async publish(id: number) {
    const rows = await this.db.query('SELECT * FROM rundowns WHERE id = $1', [id]);
    const draft = rows[0];
    if (!draft) throw new NotFoundException(`rundown ${id} not found`);
    if (draft.status !== 'draft') throw new BadRequestException('只能从草稿发布');
    const count = await this.db.query(
      'SELECT COUNT(*)::int AS n FROM segments WHERE rundown_id = $1', [id]);
    if (count[0].n === 0) throw new BadRequestException('空节目单不能发布');

    return this.db.transaction(async (q) => {
      const created = await q(
        `INSERT INTO rundowns(name, broadcast_date, version, status, day_start_sec)
         SELECT name, broadcast_date,
                (SELECT COALESCE(MAX(version), 0) + 1 FROM rundowns
                  WHERE name = $2 AND broadcast_date = $3 AND status = 'published'),
                'published', day_start_sec
         FROM rundowns WHERE id = $1 RETURNING *`,
        [id, draft.name, draft.broadcast_date],
      );
      const newId = created[0].id;
      await q(
        `INSERT INTO segments(rundown_id, position, title, kind, planned_duration_sec, overlap_next_sec, hard_top, fixed_start_sec, material_id, notes)
         SELECT $1, position, title, kind, planned_duration_sec, overlap_next_sec, hard_top, fixed_start_sec, material_id, notes
         FROM segments WHERE rundown_id = $2 ORDER BY position`,
        [newId, id],
      );
      return created[0];
    });
  }

  /** 记录一条模拟播出事件（仅针对已发布版本） */
  async addEvent(rundownId: number, body: { segmentId: number; type: 'start' | 'end'; atSec: number }) {
    const rows = await this.db.query('SELECT * FROM rundowns WHERE id = $1', [rundownId]);
    if (!rows[0]) throw new NotFoundException(`rundown ${rundownId} not found`);
    if (rows[0].status !== 'published') throw new BadRequestException('只能对已发布版本记录播出事件');
    if (!body || !['start', 'end'].includes(body.type) || body.atSec == null) {
      throw new BadRequestException('type(start|end) 与 atSec 必填');
    }
    const seg = await this.db.query(
      'SELECT id FROM segments WHERE id = $1 AND rundown_id = $2', [body.segmentId, rundownId]);
    if (!seg[0]) throw new BadRequestException('segmentId 不属于该节目单');
    const inserted = await this.db.query(
      'INSERT INTO events(rundown_id, segment_id, type, at_sec) VALUES ($1,$2,$3,$4) RETURNING *',
      [rundownId, body.segmentId, body.type, body.atSec],
    );
    return inserted[0];
  }

  listEvents(rundownId: number) {
    return this.db.query(
      'SELECT * FROM events WHERE rundown_id = $1 ORDER BY at_sec, id', [rundownId]);
  }

  clearEvents(rundownId: number) {
    return this.db.query('DELETE FROM events WHERE rundown_id = $1', [rundownId]);
  }

  /**
   * 生成一轮模拟播出事件（先清空旧事件）。
   * musicOverlapFault=true 模拟"音乐转场算错"：音乐段之后的段不再提前 overlap 秒切入，
   * 而是等音乐播完才开始；硬整点段仍锚定固定时刻，前序段被硬切。
   */
  async simulate(rundownId: number, opts: { musicOverlapFault?: boolean } = {}) {
    const rows = await this.db.query('SELECT * FROM rundowns WHERE id = $1', [rundownId]);
    const rundown = rows[0];
    if (!rundown) throw new NotFoundException(`rundown ${rundownId} not found`);
    if (rundown.status !== 'published') throw new BadRequestException('请先发布节目单再模拟播出');
    const segments: SegmentRow[] = await this.db.query(SEGMENT_SELECT, [rundownId]);
    if (segments.length === 0) throw new BadRequestException('节目单为空');

    const events: Array<{ segmentId: number; type: 'start' | 'end'; atSec: number }> = [];
    let prevEnd = rundown.day_start_sec;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const prev = segments[i - 1];
      let start: number;
      if (i === 0) {
        start = rundown.day_start_sec;
      } else if (seg.hard_top && seg.fixed_start_sec != null) {
        start = seg.fixed_start_sec; // 硬整点：无论前序如何都准点
      } else {
        const overlap = opts.musicOverlapFault && prev.kind === 'music' ? 0 : prev.overlap_next_sec;
        start = prevEnd - overlap;
      }
      let end = start + seg.planned_duration_sec;
      const next = segments[i + 1];
      if (next?.hard_top && next.fixed_start_sec != null && end > next.fixed_start_sec) {
        end = next.fixed_start_sec; // 硬整点保护：本段被切
      }
      events.push({ segmentId: seg.id, type: 'start', atSec: start });
      events.push({ segmentId: seg.id, type: 'end', atSec: end });
      prevEnd = end;
    }

    await this.db.transaction(async (q) => {
      await q('DELETE FROM events WHERE rundown_id = $1', [rundownId]);
      for (const e of events) {
        await q('INSERT INTO events(rundown_id, segment_id, type, at_sec) VALUES ($1,$2,$3,$4)',
          [rundownId, e.segmentId, e.type, e.atSec]);
      }
    });
    return this.compare(rundownId);
  }

  /** 计划时间线 vs 模拟播出事件对照 */
  async compare(rundownId: number): Promise<{ rundown: any; rows: CompareRow[]; events: BroadcastEvent[] }> {
    const rows = await this.db.query('SELECT * FROM rundowns WHERE id = $1', [rundownId]);
    if (!rows[0]) throw new NotFoundException(`rundown ${rundownId} not found`);
    const segments: SegmentRow[] = await this.db.query(SEGMENT_SELECT, [rundownId]);
    const inputs = segments.map(toInput);
    const timeline = computeTimeline(rows[0].day_start_sec, inputs);
    const events: BroadcastEvent[] = (await this.listEvents(rundownId)).map((e: any) => ({
      segmentId: e.segment_id, type: e.type, atSec: e.at_sec,
    }));
    return { rundown: rows[0], rows: comparePlan(inputs, timeline, events), events };
  }
}
