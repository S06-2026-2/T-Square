import { Global, Module } from '@nestjs/common';

import { IdempotenciaService } from './idempotencia.service';

/** Global: as rotas de criacao de qualquer modulo injetam o IdempotenciaService. */
@Global()
@Module({
  providers: [IdempotenciaService],
  exports: [IdempotenciaService],
})
export class IdempotenciaModule {}
