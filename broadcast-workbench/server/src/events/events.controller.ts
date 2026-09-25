import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Post,
  Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BroadcastEvent } from '../entities/broadcast-event.entity';
import { Schedule } from '../entities/schedule.entity';
import { ScheduleItem } from '../entities/schedule-item.entity';
import { IngestEventDto } from '../dto';

/** 模拟播出事件入口：不接真实播控设备，事件由本接口注入 */
@Controller('events')
export class EventsController {
  constructor(
    @InjectRepository(BroadcastEvent) private readonly events: Repository<BroadcastEvent>,
    @InjectRepository(Schedule) private readonly schedules: Repository<Schedule>,
    @InjectRepository(ScheduleItem) private readonly items: Repository<ScheduleItem>,
  ) {}

  @Post()
  async ingest(@Body() dto: IngestEventDto) {
    const schedule = await this.schedules.findOne({ where: { id: dto.scheduleId } });
    if (!schedule) throw new NotFoundException('节目单不存在');
    const item = await this.items.findOne({ where: { id: dto.itemId } });
    if (!item || item.scheduleId !== dto.scheduleId) {
      throw new BadRequestException('节目段不属于该节目单');
    }
    const event = this.events.create({
      scheduleId: dto.scheduleId,
      itemId: dto.itemId,
      type: dto.type,
      occurredAt: new Date(dto.occurredAt),
    });
    return this.events.save(event);
  }

  @Get()
  list(@Query('scheduleId') scheduleId: string) {
    return this.events.find({ where: { scheduleId }, order: { occurredAt: 'ASC' } });
  }

  @Delete()
  async clear(@Query('scheduleId') scheduleId: string) {
    const res = await this.events.delete({ scheduleId });
    return { deleted: res.affected ?? 0 };
  }
}
