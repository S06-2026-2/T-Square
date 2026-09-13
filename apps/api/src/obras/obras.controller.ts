import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AlocacaoGesseiroDto, CreateObraDto } from './dto/create-obra.dto';
import { QueryObraDto } from './dto/query-obra.dto';
import { UpdateObraDto } from './dto/update-obra.dto';
import { ObrasService } from './obras.service';

@ApiTags('obras')
@ApiBearerAuth()
@Controller('obras')
export class ObrasController {
  constructor(private readonly obrasService: ObrasService) {}

  @Post()
  @ApiOperation({ summary: 'Cadastra uma obra (opcionalmente ja com pagamento e gesseiros)' })
  create(@Body() dto: CreateObraDto) {
    return this.obrasService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista as obras, com filtro por status do funil' })
  findAll(@Query() query: QueryObraDto) {
    return this.obrasService.findAll(query);
  }

  @Get('resumo')
  @ApiOperation({ summary: 'Quantidade e valor total das obras por status' })
  resumo() {
    return this.obrasService.resumo();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.obrasService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateObraDto) {
    return this.obrasService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.obrasService.remove(id);
  }

  @Post(':id/gesseiros')
  @ApiOperation({ summary: 'Aloca (ou atualiza) um gesseiro na obra' })
  alocarGesseiro(@Param('id') id: string, @Body() dto: AlocacaoGesseiroDto) {
    return this.obrasService.alocarGesseiro(id, dto);
  }

  @Delete(':id/gesseiros/:gesseiroId')
  removerGesseiro(@Param('id') id: string, @Param('gesseiroId') gesseiroId: string) {
    return this.obrasService.removerGesseiro(id, gesseiroId);
  }

  @Patch(':id/concluir')
  @ApiOperation({
    summary: 'Conclui a obra e credita automaticamente os gesseiros alocados',
  })
  concluir(@Param('id') id: string) {
    return this.obrasService.concluir(id);
  }
}
