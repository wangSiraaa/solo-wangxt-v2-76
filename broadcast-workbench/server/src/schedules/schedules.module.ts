import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Schedule } from '../entities/schedule.entity';
import { ScheduleItem } from '../entities/schedule-item.entity';
import { BroadcastEvent } from '../entities/broadcast-event.entity';
import { SchedulesService } from './schedules.service';
import { SchedulesController } from './schedules.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Schedule, ScheduleItem, BroadcastEvent])],
  providers: [SchedulesService],
  controllers: [SchedulesController],
})
export class SchedulesModule {}
