import { INestApplication } from '@nestjs/common';

/**
 * CORS unico da API, usado pelo main.ts e pelo e2e (IDP-09).
 * `allowedHeaders` explicito: sem o `Idempotency-Key` na lista, o navegador bloquearia
 * no preflight todo POST de criacao vindo do front (outra origem).
 */
export function configurarCors(app: INestApplication): void {
  app.enableCors({
    origin: origensPermitidas(process.env.CORS_ORIGIN),
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  });
}

/**
 * Le o CORS_ORIGIN (lista separada por virgula). Tira espacos e a barra final: o navegador manda
 * `Origin: https://x.vercel.app`, sem barra, e `https://x.vercel.app/` nunca bateria. Vazio ou
 * ausente libera qualquer origem; antes, um CORS_ORIGIN vazio bloqueava todas.
 */
export function origensPermitidas(valor: string | undefined): string[] | '*' {
  const origens = (valor ?? '')
    .split(',')
    .map((origem) => origem.trim().replace(/\/+$/, ''))
    .filter((origem) => origem.length > 0);
  return origens.length > 0 ? origens : '*';
}
