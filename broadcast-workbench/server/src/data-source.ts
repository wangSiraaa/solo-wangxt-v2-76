import { DataSourceOptions } from 'typeorm';
import { Material } from './entities/material.entity';
import { Schedule } from './entities/schedule.entity';
import { ScheduleItem } from './entities/schedule-item.entity';
import { BroadcastEvent } from './entities/broadcast-event.entity';

export const ENTITIES = [Material, Schedule, ScheduleItem, BroadcastEvent];

/** 默认连接本机 docker-compose 起的 PostgreSQL，可用环境变量覆盖 */
export function buildDataSourceOptions(): DataSourceOptions {
  return {
    type: 'postgres',
    host: process.env.PGHOST ?? 'localhost',
    port: Number(process.env.PGPORT ?? 5432),
    username: process.env.PGUSER ?? 'broadcast',
    password: process.env.PGPASSWORD ?? 'broadcast',
    database: process.env.PGDATABASE ?? 'broadcast',
    entities: ENTITIES,
    synchronize: true, // 演示项目免迁移；生产应改为 migrations
  };
}
