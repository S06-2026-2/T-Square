import { INestApplication } from '@nestjs/common';

/**
 * CORS unico da API, usado pelo main.ts e pelo e2e (IDP-09).
 * `allowedHeaders` explicito: sem o `Idempotency-Key` na lista, o navegador bloquearia
 * no preflight todo POST de criacao vindo do front (outra origem).
 */
export function configurarCors(app: INestApplication): void {
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? '*',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  });
}
