import { Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrigemAnaliseEstoque } from '@prisma/client';

import { AgenteEstoqueService } from './agente-estoque.service';
import { AlertasEstoqueService } from './alertas-estoque.service';

@ApiTags('estoque')
@ApiBearerAuth()
@Controller('estoque/agente')
export class AgenteEstoqueController {
  constructor(
    private readonly agenteService: AgenteEstoqueService,
    private readonly alertasService: AlertasEstoqueService,
  ) {}

  @Post('analisar')
  @ApiOperation({
    summary: 'Roda agora uma análise do agente de estoque e devolve a análise finalizada',
  })
  analisar() {
    return this.agenteService.analisar(OrigemAnaliseEstoque.MANUAL);
  }

  @Get('alertas')
  @ApiOperation({ summary: 'Alertas ATIVO do agente e a última análise terminada' })
  alertas() {
    return this.alertasService.listarAtivos();
  }

  @Get('silenciados')
  @ApiOperation({
    summary: 'Materiais silenciados porque o operador dispensou ou resolveu o último alerta',
  })
  silenciados() {
    return this.alertasService.listarSilenciados();
  }

  @Patch('alertas/:id/dispensar')
  @ApiOperation({ summary: 'Dispensa um alerta ATIVO (silencia o material por 5 dias)' })
  dispensar(@Param('id') id: string) {
    return this.alertasService.dispensar(id);
  }

  @Patch('alertas/:id/resolver')
  @ApiOperation({ summary: 'Marca um alerta ATIVO como resolvido pelo operador' })
  resolver(@Param('id') id: string) {
    return this.alertasService.resolver(id);
  }
}
