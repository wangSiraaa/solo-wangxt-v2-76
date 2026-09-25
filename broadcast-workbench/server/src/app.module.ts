import { Module } from '@nestjs/common';
import {
  TypeOrmModule,
  TypeOrmModuleAsyncOptions,
  TypeOrmModuleOptions,
} from '@nestjs/typeorm';
import { buildDataSourceOptions } from './data-source';
import { MaterialsModule } from './materials/materials.module';
import { SchedulesModule } from './schedules/schedules.module';
import { EventsModule } from './events/events.module';
import { SeedModule } from './seed/seed.module';

/** 工厂形式便于测试用内存库（pg-mem）替换数据源 */
export function createAppModule(
  options: TypeOrmModuleOptions = buildDataSourceOptions(),
  dataSourceFactory?: TypeOrmModuleAsyncOptions['dataSourceFactory'],
) {
  @Module({
    imports: [
      TypeOrmModule.forRootAsync({
        useFactory: () => options,
        dataSourceFactory,
      }),
      MaterialsModule,
      SchedulesModule,
      EventsModule,
      SeedModule,
    ],
  })
  class AppModule {}
  return AppModule;
}
