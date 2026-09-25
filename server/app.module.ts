import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service.js';
import { RundownsController } from './rundowns.controller.js';
import { RundownsService } from './rundowns.service.js';

@Module({
  providers: [DatabaseService, RundownsService],
  controllers: [RundownsController],
})
export class AppModule {}
