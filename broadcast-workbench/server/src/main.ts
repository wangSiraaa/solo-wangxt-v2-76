import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { createAppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(createAppModule());
  app.setGlobalPrefix('api');
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`播出工作台后端已启动: http://localhost:${port}/api`);
}

bootstrap();
