import { Module } from '@nestjs/common';

import { AgendadorAgenteService } from './agendador-agente.service';
import { AgenteEstoqueController } from './agente-estoque.controller';
import { AgenteEstoqueService } from './agente-estoque.service';
import { AlertasEstoqueService } from './alertas-estoque.service';
import { AnthropicClienteLlm, CLIENTE_LLM } from './cliente-llm';
import { FerramentasAgente } from './ferramentas-agente';
import { PrevisaoEstoqueService } from './previsao-estoque.service';

@Module({
  controllers: [AgenteEstoqueController],
  providers: [
    AgenteEstoqueService,
    AlertasEstoqueService,
    AgendadorAgenteService,
    PrevisaoEstoqueService,
    FerramentasAgente,
    { provide: CLIENTE_LLM, useClass: AnthropicClienteLlm },
  ],
})
export class AgenteEstoqueModule {}
