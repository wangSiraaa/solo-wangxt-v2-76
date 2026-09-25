import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';
import { randomUUID } from 'crypto';
import { ScheduleItem } from './schedule-item.entity';

export type ScheduleStatus = 'draft' | 'published' | 'archived';

/**
 * 节目单：同一播出日只允许一个 published 与一个 draft。
 * 发布会把当前 published 归档为 archived 并生成 version+1 的新节目单，
 * 草稿的修改永远不会直接落到已发布版本上。
 */
@Entity('schedules')
export class Schedule {
  @PrimaryColumn('uuid')
  id: string = randomUUID();

  @Column()
  name: string;

  /** 播出日，YYYY-MM-DD（本地） */
  @Column({ type: 'date' })
  broadcastDate: string;

  /** 节目带起点（如 08:00:00） */
  @Column({ type: 'timestamptz' })
  startAt: Date;

  @Column({ type: 'varchar', length: 12 })
  status: ScheduleStatus;

  @Column('int')
  version: number;

  /** 草稿来源的节目单 id（便于追溯） */
  @Column('uuid', { nullable: true })
  sourceScheduleId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @OneToMany(() => ScheduleItem, (item) => item.schedule, { cascade: true, eager: true })
  items: ScheduleItem[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
