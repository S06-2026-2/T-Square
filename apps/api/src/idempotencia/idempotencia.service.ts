import {
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ClientePrisma, ContextoIdempotencia } from './tipos';

/** Vida de uma chave (IDP-05). */
export const VIDA_CHAVE_MS = 24 * 60 * 60 * 1000;

/** Transacao mais longa que o padrao do Prisma (5 s): `POST /obras` com muitos previstos. */
const TIMEOUT_TRANSACAO_MS = 15_000;

/**
 * Reenvio seguro dos POST de criacao (AD-009).
 * Spec: .claude/specs/features/pwa-instalavel-responsivo/spec.md (IDP-02..06)
 *
 * Com `Idempotency-Key`, a entidade e a chave sao gravadas na MESMA transacao: se o service
 * falhar ou a API cair, o PostgreSQL desfaz as duas. O "em processamento" (409) e a trava
 * consultiva da transacao, que se solta sozinha no COMMIT/ROLLBACK.
 */
@Injectable()
export class IdempotenciaService {
  constructor(private readonly prisma: PrismaService) {}

  async executar<T>(
    ctx: ContextoIdempotencia,
    criar: (tx?: ClientePrisma) => Promise<T>,
  ): Promise<T | unknown> {
    // IDP-06: sem chave, o caminho de hoje. Nao se passa cliente nenhum: o service usa o proprio
    // this.prisma e, no movimentar(), abre a propria $transaction (saldo + movimentacao atomicos).
    // Passar this.prisma como tx faria o movimentar() gravar saldo e movimentacao separados.
    if (ctx === null) {
      return criar();
    }

    const { chave, usuarioId, rota, hashCorpo } = ctx;

    return this.prisma.$transaction(
      async (tx) => {
        // IDP-04: outro pedido com a mesma chave esta dentro da transacao dele.
        const textoTrava = `${usuarioId} ${rota} ${chave}`;
        const [{ ok }] = await tx.$queryRaw<{ ok: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(hashtextextended(${textoTrava}::text, 0)) AS ok`;
        if (!ok) {
          throw new ConflictException('Este envio ainda está sendo processado.');
        }

        const existente = await tx.chaveIdempotencia.findUnique({
          where: { usuarioId_rota_chave: { usuarioId, rota, chave } },
        });

        if (existente) {
          if (Date.now() - existente.criadoEm.getTime() > VIDA_CHAVE_MS) {
            // IDP-05: vencida, vale como nova.
            await tx.chaveIdempotencia.delete({ where: { id: existente.id } });
          } else if (existente.hashCorpo !== hashCorpo) {
            // IDP-03
            throw new UnprocessableEntityException(
              'Esta Idempotency-Key já foi usada com outros dados.',
            );
          } else {
            // IDP-02: replay, sem gravar nada.
            return existente.resposta;
          }
        }

        const resultado = await criar(tx);
        // Exatamente o que vai para a rede: Decimal vira string, Date vira ISO.
        const resposta = JSON.parse(JSON.stringify(resultado)) as Prisma.InputJsonValue;

        try {
          await tx.chaveIdempotencia.create({
            data: { chave, usuarioId, rota, hashCorpo, statusHttp: 201, resposta },
          });
        } catch (erro) {
          // Colisao no indice unico que passou pela trava: trata como "em processamento".
          if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
            throw new ConflictException('Este envio ainda está sendo processado.');
          }
          throw erro;
        }

        return resposta;
      },
      { timeout: TIMEOUT_TRANSACAO_MS },
    );
  }

  /** Apaga as chaves com mais de 24 h (IDP-05). */
  @Cron(CronExpression.EVERY_HOUR)
  async limparVencidas() {
    return this.prisma.chaveIdempotencia.deleteMany({
      where: { criadoEm: { lt: new Date(Date.now() - VIDA_CHAVE_MS) } },
    });
  }
}
