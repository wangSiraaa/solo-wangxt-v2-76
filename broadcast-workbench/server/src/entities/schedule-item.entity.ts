import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { randomUUID } from 'crypto';
import { Schedule } from './schedule.entity';
import { Material } from './material.entity';

/**
 * 节目段：节目单中的一行。
 * - overlapSec：与上一段的转场重叠（音乐/台标常用）；
 * - hardStartAt：硬整点，钉死开播时间，前序超时也不能推迟它；
 * - sourceItemId：血缘 id。草稿从已发布复制时指向源段，发布时延续，
 *   前端用 sourceItemId ?? id 作为对照键计算"受影响的后续开始时间"。
 */
@Entity('schedule_items')
export class ScheduleItem {
  @PrimaryColumn('uuid')
  id: string = randomUUID();

  @Column('uuid')
  scheduleId: string;

  @ManyToOne(() => Schedule, (s) => s.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'scheduleId' })
  schedule: Schedule;

  @Column('int')
  position: number;

  @Column('uuid', { nullable: true })
  materialId: string | null;

  @ManyToOne(() => Material, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'materialId' })
  material: Material | null;

  @Column()
  title: string;

  /** 冗余素材类型快照，保证改素材不会回头改变已排节目单的时间账 */
  @Column({ type: 'varchar', length: 20 })
  materialType: string;

  @Column('int')
  durationSec: number;

  @Column('int', { default: 0 })
  overlapSec: number;

  @Column({ type: 'timestamptz', nullable: true })
  hardStartAt: Date | null;

  @Column('uuid', { nullable: true })
  sourceItemId: string | null;
}
