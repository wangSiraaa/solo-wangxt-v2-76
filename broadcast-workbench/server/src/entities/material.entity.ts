import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { randomUUID } from 'crypto';

export type MaterialType = 'program' | 'news' | 'music' | 'ident' | 'weather' | 'ad';

/** 素材：可被多个节目段引用的成片/音乐/台标 */
@Entity('materials')
export class Material {
  @PrimaryColumn('uuid')
  id: string = randomUUID();

  @Column()
  title: string;

  @Column({ type: 'varchar', length: 20 })
  type: MaterialType;

  @Column('int')
  durationSec: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
