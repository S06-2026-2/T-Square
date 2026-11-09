import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiIdempotencia } from '../idempotencia/api-idempotencia.decorator';
import { ContextoIdempotencia } from '../idempotencia/contexto-idempotencia.decorator';
import { IdempotenciaService } from '../idempotencia/idempotencia.service';
import { CreateGesseiroDto } from './dto/create-gesseiro.dto';
import { CreateLancamentoDto } from './dto/create-lancamento.dto';
import { UpdateGesseiroDto } from './dto/update-gesseiro.dto';
import { GesseirosService } from './gesseiros.service';

@ApiTags('gesseiros')
@ApiBearerAuth()
@Controller('gesseiros')
export class GesseirosController {
  constructor(
    private readonly gesseirosService: GesseirosService,
    private readonly idempotencia: IdempotenciaService,
  ) {}

  @Get()
  findAll() {
    return this.gesseirosService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.gesseirosService.findOne(id);
  }

  @Get(':id/extrato')
  @ApiOperation({ summary: 'Vale, haver e saldo a receber do gesseiro' })
  extrato(@Param('id') id: string) {
    return this.gesseirosService.extrato(id);
  }

  @Post()
  @ApiIdempotencia()
  create(@Body() dto: CreateGesseiroDto, @ContextoIdempotencia() ctx: ContextoIdempotencia) {
    return this.idempotencia.executar(ctx, (tx) => this.gesseirosService.create(dto, tx));
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateGesseiroDto) {
    return this.gesseirosService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.gesseirosService.remove(id);
  }

  @Post(':id/lancamentos')
  @ApiOperation({ summary: 'Registra um vale ou um pagamento para o gesseiro' })
  @ApiIdempotencia()
  registrarLancamento(
    @Param('id') id: string,
    @Body() dto: CreateLancamentoDto,
    @ContextoIdempotencia() ctx: ContextoIdempotencia,
  ) {
    return this.idempotencia.executar(ctx, (tx) =>
      this.gesseirosService.registrarLancamento(id, dto, tx),
    );
  }
}
