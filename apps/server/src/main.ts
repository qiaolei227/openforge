import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './notification/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  app.enableCors();

  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    const ioAdapter = new RedisIoAdapter(app);
    await ioAdapter.connectToRedis(redisUrl);
    app.useWebSocketAdapter(ioAdapter);
    logger.log('WebSocket Redis adapter enabled');
  } else {
    logger.warn('REDIS_URL not set — WebSocket using in-memory adapter (single-node only)');
  }

  await app.listen(3000);
  console.log('Server running on http://localhost:3000');
}
bootstrap();
