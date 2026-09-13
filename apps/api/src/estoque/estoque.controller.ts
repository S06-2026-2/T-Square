import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CreateMaterialDto } from './dto/create-material.dto';
import { CreateMovimentacaoDto } from './dto/create-movimentacao.dto';
import { EstoqueService } from './estoque.service';

@ApiTags('estoque')
@ApiBearerAuth()
@Controller('estoque')
export class EstoqueController {
  constructor(private readonly estoqueService: EstoqueService) {}

  @Get('materiais')
  listarMateriais() {
    return this.estoqueService.listarMateriais();
  }

  @Post('materiais')
  criarMaterial(@Body() dto: CreateMaterialDto) {
    return this.estoqueService.criarMaterial(dto);
  }

  @Get('movimentacoes')
  listarMovimentacoes(@Query('materialId') materialId?: string) {
    return this.estoqueService.listarMovimentacoes(materialId);
  }

  @Post('movimentacoes')
  @ApiOperation({ summary: 'Registra entrada ou saida de material e atualiza o saldo' })
  movimentar(@Body() dto: CreateMovimentacaoDto) {
    return this.estoqueService.movimentar(dto);
  }

  @Get('alertas')
  @ApiOperation({ summary: 'Materiais com saldo abaixo do estoque minimo' })
  alertas() {
    return this.estoqueService.abaixoDoMinimo();
  }
}
