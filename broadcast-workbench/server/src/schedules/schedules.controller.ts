import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { SchedulesService } from './schedules.service';
import { ReplaceItemsDto, SimulateDto } from '../dto';

@Controller('schedules')
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  /** 主面板：?date=YYYY-MM-DD，缺省为今天 */
  @Get('board')
  board(@Query('date') date?: string) {
    return this.schedules.getBoard(date ?? localDateStr());
  }

  @Post(':id/draft')
  createDraft(@Param('id') id: string) {
    return this.schedules.createDraftFrom(id);
  }

  @Put(':id/items')
  replaceItems(@Param('id') id: string, @Body() dto: ReplaceItemsDto) {
    return this.schedules.replaceDraftItems(id, dto);
  }

  @Post(':id/publish')
  publish(@Param('id') id: string) {
    return this.schedules.publish(id);
  }

  @Get(':id/comparison')
  comparison(@Param('id') id: string) {
    return this.schedules.getComparison(id);
  }

  @Post(':id/simulate')
  simulate(@Param('id') id: string, @Body() dto: SimulateDto) {
    return this.schedules.simulate(id, dto);
  }
}

function localDateStr(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
