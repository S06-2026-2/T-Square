import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CreateGesseiroDto } from './dto/create-gesseiro.dto';
import { CreateLancamentoDto } from './dto/create-lancamento.dto';
import { UpdateGesseiroDto } from './dto/update-gesseiro.dto';
import { GesseirosService } from './gesseiros.service';

@ApiTags('gesseiros')
@ApiBearerAuth()
@Controller('gesseiros')
export class GesseirosController {
  constructor(private readonly gesseirosService: GesseirosService) {}

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
  create(@Body() dto: CreateGesseiroDto) {
    return this.gesseirosService.create(dto);
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
  registrarLancamento(@Param('id') id: string, @Body() dto: CreateLancamentoDto) {
    return this.gesseirosService.registrarLancamento(id, dto);
  }
}
