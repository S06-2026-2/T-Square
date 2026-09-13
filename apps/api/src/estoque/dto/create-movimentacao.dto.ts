import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoMovimentacao } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateMovimentacaoDto {
  @ApiProperty()
  @IsString()
  materialId!: string;

  @ApiProperty({ enum: TipoMovimentacao })
  @IsEnum(TipoMovimentacao)
  tipo!: TipoMovimentacao;

  @ApiProperty({ example: 20 })
  @IsNumber()
  @Min(0.01)
  quantidade!: number;

  @ApiPropertyOptional({ description: 'Obra que consumiu o material, quando for SAIDA' })
  @IsOptional()
  @IsString()
  obraId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observacao?: string;
}
