import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import type { Client } from 'pg';
import { seedIfEmpty } from './seed.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS materials (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,               -- program | music | ident | news
  duration_sec INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rundowns (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  broadcast_date TEXT NOT NULL,     -- YYYY-MM-DD
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',  -- draft | published
  day_start_sec INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS segments (
  id SERIAL PRIMARY KEY,
  rundown_id INTEGER NOT NULL REFERENCES rundowns(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  planned_duration_sec INTEGER NOT NULL,
  overlap_next_sec INTEGER NOT NULL DEFAULT 0,
  hard_top BOOLEAN NOT NULL DEFAULT FALSE,
  fixed_start_sec INTEGER,
  material_id INTEGER REFERENCES materials(id),
  notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  rundown_id INTEGER NOT NULL REFERENCES rundowns(id) ON DELETE CASCADE,
  segment_id INTEGER NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  type TEXT NOT NULL,               -- start | end
  at_sec INTEGER NOT NULL,          -- 当日 0 点起秒
  created_at TIMESTAMPTZ DEFAULT now()
);
`;

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pg: EmbeddedPostgres;
  private client: Client;

  async onModuleInit() {
    const dataDir = process.env.PGDATA_DIR || './pgdata';
    this.pg = new EmbeddedPostgres({
      databaseDir: dataDir,
      user: 'postgres',
      password: 'postgres',
      port: 5433,
      persistent: true,
    });
    if (!existsSync(`${dataDir}/PG_VERSION`)) {
      await this.pg.initialise(); // 首次运行下载并初始化 PostgreSQL 集群
    }
    await this.pg.start();
    this.client = this.pg.getPgClient('postgres');
    await this.client.connect();
    await this.client.query(SCHEMA);
    await seedIfEmpty(this.client);
  }

  async onModuleDestroy() {
    try { await this.client?.end(); } catch { /* ignore */ }
    try { await this.pg?.stop(); } catch { /* ignore */ }
  }

  async query(sql: string, params?: any[]) {
    const res = await this.client.query(sql, params);
    return res.rows as any[];
  }

  async transaction<T>(fn: (q: (sql: string, params?: any[]) => Promise<any[]>) => Promise<T>): Promise<T> {
    await this.client.query('BEGIN');
    try {
      const result = await fn(async (sql, params) => (await this.client.query(sql, params)).rows as any[]);
      await this.client.query('COMMIT');
      return result;
    } catch (e) {
      await this.client.query('ROLLBACK');
      throw e;
    }
  }
}
