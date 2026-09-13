import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoLancamento } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateLancamentoDto {
  @ApiProperty({
    enum: TipoLancamento,
    description: 'VALE = adiantamento; PAGAMENTO = acerto; CREDITO e gerado automaticamente',
  })
  @IsEnum(TipoLancamento)
  tipo!: TipoLancamento;

  @ApiProperty({ example: 500 })
  @IsNumber()
  @Min(0)
  valor!: number;

  @ApiPropertyOptional({ description: 'Obra relacionada, quando houver' })
  @IsOptional()
  @IsString()
  obraId?: string;

  @ApiPropertyOptional({ example: 'Vale adiantado em dinheiro' })
  @IsOptional()
  @IsString()
  descricao?: string;
}
