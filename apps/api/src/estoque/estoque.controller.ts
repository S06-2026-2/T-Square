import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiIdempotencia } from '../idempotencia/api-idempotencia.decorator';
import { ContextoIdempotencia } from '../idempotencia/contexto-idempotencia.decorator';
import { IdempotenciaService } from '../idempotencia/idempotencia.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { CreateMovimentacaoDto } from './dto/create-movimentacao.dto';
import { EstoqueService } from './estoque.service';

@ApiTags('estoque')
@ApiBearerAuth()
@Controller('estoque')
export class EstoqueController {
  constructor(
    private readonly estoqueService: EstoqueService,
    private readonly idempotencia: IdempotenciaService,
  ) {}

  @Get('materiais')
  listarMateriais() {
    return this.estoqueService.listarMateriais();
  }

  @Post('materiais')
  @ApiIdempotencia()
  criarMaterial(@Body() dto: CreateMaterialDto, @ContextoIdempotencia() ctx: ContextoIdempotencia) {
    return this.idempotencia.executar(ctx, (tx) => this.estoqueService.criarMaterial(dto, tx));
  }

  @Get('movimentacoes')
  listarMovimentacoes(@Query('materialId') materialId?: string) {
    return this.estoqueService.listarMovimentacoes(materialId);
  }

  @Post('movimentacoes')
  @ApiOperation({ summary: 'Registra entrada ou saida de material e atualiza o saldo' })
  @ApiIdempotencia()
  movimentar(@Body() dto: CreateMovimentacaoDto, @ContextoIdempotencia() ctx: ContextoIdempotencia) {
    return this.idempotencia.executar(ctx, (tx) => this.estoqueService.movimentar(dto, tx));
  }

  @Get('alertas')
  @ApiOperation({ summary: 'Materiais com saldo abaixo do estoque minimo' })
  alertas() {
    return this.estoqueService.abaixoDoMinimo();
  }
}
