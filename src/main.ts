import { ConsoleLogger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({
      json: process.env.NODE_ENV === 'production',
    }),
  });
  const config = app.get(ConfigService);
  const swaggerEnabled = config.getOrThrow<boolean>('ENABLE_SWAGGER');

  app.use(
    helmet(swaggerEnabled ? { contentSecurityPolicy: false } : undefined),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Ticket System API')
      .setDescription('영화 티켓 조회 및 동시성 안전 예매 API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);

    SwaggerModule.setup('docs', app, document, {
      jsonDocumentUrl: 'docs-json',
    });
  }

  await app.listen(config.getOrThrow<number>('PORT'), '0.0.0.0');
}

void bootstrap();
