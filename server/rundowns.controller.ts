import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { RundownsService, type SegmentPayload } from './rundowns.service.js';

@Controller()
export class RundownsController {
  constructor(private readonly svc: RundownsService) {}

  @Get('materials')
  materials() {
    return this.svc.listMaterials();
  }

  @Get('rundowns')
  rundowns() {
    return this.svc.listRundowns();
  }

  @Get('rundowns/:id')
  rundown(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getRundown(id);
  }

  @Post('rundowns')
  createDraft(@Body() body: { name: string; broadcastDate: string; dayStartSec: number }) {
    return this.svc.createDraft(body);
  }

  @Put('rundowns/:id/segments')
  replaceSegments(@Param('id', ParseIntPipe) id: number, @Body() body: { segments: SegmentPayload[] }) {
    return this.svc.replaceSegments(id, body?.segments);
  }

  @Post('rundowns/:id/publish')
  publish(@Param('id', ParseIntPipe) id: number) {
    return this.svc.publish(id);
  }

  @Post('rundowns/:id/events')
  addEvent(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { segmentId: number; type: 'start' | 'end'; atSec: number },
  ) {
    return this.svc.addEvent(id, body);
  }

  @Delete('rundowns/:id/events')
  clearEvents(@Param('id', ParseIntPipe) id: number) {
    return this.svc.clearEvents(id);
  }

  @Post('rundowns/:id/simulate')
  simulate(@Param('id', ParseIntPipe) id: number, @Body() body: { musicOverlapFault?: boolean }) {
    return this.svc.simulate(id, body ?? {});
  }

  @Get('rundowns/:id/compare')
  compare(@Param('id', ParseIntPipe) id: number) {
    return this.svc.compare(id);
  }
}
