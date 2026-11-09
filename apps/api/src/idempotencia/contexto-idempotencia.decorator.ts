import { BadRequestException, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

import { hashCorpo } from './hash-corpo';
import { ContextoIdempotencia as Contexto } from './tipos';

/** Mesmo nome do decorator, para `@ContextoIdempotencia() ctx: ContextoIdempotencia`. */
export type ContextoIdempotencia = Contexto;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Monta o contexto a partir do request: cabecalho `Idempotency-Key`, usuario do JWT,
 * `METODO /path/real` (sem query string) e o hash canonico do corpo.
 */
export function extrairContexto(ctx: ExecutionContext): ContextoIdempotencia {
  const req = ctx.switchToHttp().getRequest<Request & { user: { id: string } }>();
  const chave = req.header('Idempotency-Key');

  if (chave === undefined) {
    return null;
  }

  if (!UUID.test(chave)) {
    throw new BadRequestException('Idempotency-Key deve ser um UUID.');
  }

  return {
    chave,
    usuarioId: req.user.id,
    rota: `${req.method} ${req.path}`,
    hashCorpo: hashCorpo(req.body),
  };
}

/** Param decorator das rotas de criacao. Ver AD-009. */
export const ContextoIdempotencia = createParamDecorator((_dado: unknown, ctx: ExecutionContext) =>
  extrairContexto(ctx),
);
