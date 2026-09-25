import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BroadcastEvent } from '../entities/broadcast-event.entity';
import { Schedule } from '../entities/schedule.entity';
import { ScheduleItem } from '../entities/schedule-item.entity';
import { EventsController } from './events.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BroadcastEvent, Schedule, ScheduleItem])],
  controllers: [EventsController],
})
export class EventsModule {}
