interface Querier {
  query(sql: string, params?: any[]): Promise<{ rows: any[] }>;
}

const H = 3600;
const M = 60;
const hm = (h: number, m: number) => h * H + m * M;

/**
 * 样例数据：09:30 开播的上午板块，覆盖三类核对场景——
 *  1) 短台标插播（5s/8s 的 ident 段）；
 *  2) 音乐段的转场叠加（overlap_next_sec = 10/15s）；
 *  3) 素材不足（早间资讯杂志缺 20s、午间剧场·上缺 80s）。
 * 10:00 与 12:00 两档新闻标记为硬整点。
 */
export async function seedIfEmpty(db: Querier) {
  const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM materials');
  if (rows[0].n > 0) return;

  const materials: Array<[string, string, number]> = [
    ['早间资讯杂志（带片头）', 'program', 19 * M + 40], // 1180s，比 20 分钟栏目短 20s
    ['台标ID·短版', 'ident', 8],
    ['台标ID·超短版', 'ident', 5],
    ['音乐时光·秋日歌单', 'music', 10 * M],
    ['整点新闻·十点档', 'news', 5 * M],
    ['深度报道·江边的作坊', 'news', 15 * M],
    ['音乐桥·钢琴小品', 'music', 3 * M],
    ['午间剧场·上（含广告位）', 'program', 23 * M + 40], // 1420s，比 25 分钟栏目短 80s
    ['纪录片·山河', 'program', 40 * M],
    ['音乐填隙·轻音乐', 'music', 5 * M],
    ['午间剧场·下', 'program', 25 * M],
    ['午间音乐桥', 'music', 2 * M],
    ['正午新闻', 'news', 10 * M],
  ];
  const matIds: number[] = [];
  for (const [title, kind, dur] of materials) {
    const r = await db.query(
      'INSERT INTO materials(title, kind, duration_sec) VALUES ($1,$2,$3) RETURNING id',
      [title, kind, dur],
    );
    matIds.push(r.rows[0].id);
  }
  const [mag, ident8, ident5, musicTime, news10, depth, piano, dramaA, docu, fill, dramaB, noonBridge, newsNoon] = matIds;

  const r = await db.query(
    `INSERT INTO rundowns(name, broadcast_date, version, status, day_start_sec)
     VALUES ('上午板块节目单', '2026-09-25', 1, 'draft', $1) RETURNING id`,
    [hm(9, 30)],
  );
  const rid = r.rows[0].id;

  // [title, kind, plannedSec, overlapNextSec, hardTop, fixedStartSec, materialId, notes]
  const segments: Array<[string, string, number, number, boolean, number | null, number | null, string]> = [
    ['早间资讯杂志', 'program', 20 * M, 0, false, null, mag, '素材 19:40，缺口 20s 需现场补'],
    ['台标短插播', 'ident', 8, 0, false, null, ident8, '整点前台标'],
    ['音乐时光', 'music', 10 * M, 15, false, null, musicTime, '与新闻转场叠加 15s'],
    ['整点新闻', 'news', 5 * M, 0, true, hm(10, 0), news10, '硬整点，10:00 必须准点'],
    ['深度报道', 'news', 15 * M, 0, false, null, depth, ''],
    ['音乐桥', 'music', 3 * M, 10, false, null, piano, '与剧场转场叠加 10s'],
    ['午间剧场·上', 'program', 25 * M, 0, false, null, dramaA, '素材 23:40，缺口 80s'],
    ['台标短插播', 'ident', 5, 0, false, null, ident5, ''],
    ['纪录片·山河', 'program', 40 * M, 0, false, null, docu, ''],
    ['音乐填隙', 'music', 5 * M, 10, false, null, fill, '与剧场转场叠加 10s'],
    ['午间剧场·下', 'program', 25 * M, 0, false, null, dramaB, ''],
    ['台标短插播', 'ident', 5, 0, false, null, ident5, ''],
    ['午间音乐桥', 'music', 2 * M, 0, false, null, noonBridge, ''],
    ['正午新闻', 'news', 10 * M, 0, true, hm(12, 0), newsNoon, '硬整点，12:00 必须准点'],
  ];
  for (let i = 0; i < segments.length; i++) {
    const [title, kind, dur, overlap, hard, fixed, mat, notes] = segments[i];
    await db.query(
      `INSERT INTO segments(rundown_id, position, title, kind, planned_duration_sec, overlap_next_sec, hard_top, fixed_start_sec, material_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [rid, i, title, kind, dur, overlap, hard, fixed, mat, notes],
    );
  }
}
