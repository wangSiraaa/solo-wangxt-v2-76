import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Material } from '../entities/material.entity';
import { Schedule } from '../entities/schedule.entity';
import { ScheduleItem } from '../entities/schedule-item.entity';
import { SeedService } from './seed.service';

@Module({
  imports: [TypeOrmModule.forFeature([Material, Schedule, ScheduleItem])],
  providers: [SeedService],
})
export class SeedModule {}
