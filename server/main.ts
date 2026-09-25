import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors();
  await app.listen(Number(process.env.PORT || 3000));
  console.log('rundown-workbench API listening on :3000 (prefix /api)');
}
bootstrap();
