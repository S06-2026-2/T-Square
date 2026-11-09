import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

/** O cliente Prisma do service ou o `tx` de uma transacao interativa (que nao tem `$transaction`). */
export type ClientePrisma = Prisma.TransactionClient | PrismaService;

/** O que identifica um envio idempotente. `null` quando o POST veio sem `Idempotency-Key` (IDP-06). */
export type ContextoIdempotencia = {
  chave: string;
  usuarioId: string;
  rota: string;
  hashCorpo: string;
} | null;
