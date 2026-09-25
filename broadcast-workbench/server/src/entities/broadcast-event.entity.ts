import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { randomUUID } from 'crypto';

export type BroadcastEventType = 'start' | 'end';

/** 模拟播出事件：不接真实播控设备，由 /events 接口或 /simulate 注入 */
@Entity('broadcast_events')
export class BroadcastEvent {
  @PrimaryColumn('uuid')
  id: string = randomUUID();

  @Column('uuid')
  scheduleId: string;

  @Column('uuid')
  itemId: string;

  @Column({ type: 'varchar', length: 8 })
  type: BroadcastEventType;

  /** 事件发生的播出时刻 */
  @Column({ type: 'timestamptz' })
  occurredAt: Date;

  /** 工作台收到事件的时刻 */
  @CreateDateColumn({ type: 'timestamptz' })
  receivedAt: Date;
}
