import { Module } from '@nestjs/common';

import { LimpezaService } from './limpeza.service';

/** Job diário que apaga de vez o que está arquivado há 7 dias (AD-015, ARQ-13). */
@Module({
  providers: [LimpezaService],
  exports: [LimpezaService],
})
export class LimpezaModule {}
