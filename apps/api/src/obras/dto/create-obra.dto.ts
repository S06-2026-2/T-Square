import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FormaPagamento, StatusObra } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { MaterialPrevistoDto } from './materiais-previstos.dto';

export class PagamentoDto {
  @ApiProperty({ enum: FormaPagamento })
  @IsEnum(FormaPagamento)
  forma!: FormaPagamento;

  @ApiPropertyOptional({ default: 1, description: 'Numero de parcelas combinadas com o cliente' })
  @IsOptional()
  @IsInt()
  @Min(1)
  parcelas?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  valorEntrada?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observacao?: string;
}

export class AlocacaoGesseiroDto {
  @ApiProperty({ description: 'ID do gesseiro alocado na obra' })
  @IsString()
  gesseiroId!: string;

  @ApiProperty({ description: 'Valor de mao de obra combinado para este gesseiro nesta obra' })
  @IsNumber()
  @Min(0)
  valorCombinado!: number;

  @ApiPropertyOptional({ example: 'Forro' })
  @IsOptional()
  @IsString()
  funcao?: string;
}

export class CreateObraDto {
  @ApiProperty({ example: 'Forro de gesso - Residencia Silva' })
  @IsString()
  @MinLength(3)
  titulo!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  descricao?: string;

  @ApiProperty({ example: 'Maria Silva' })
  @IsString()
  @MinLength(3)
  clienteNome!: string;

  @ApiPropertyOptional({ example: '(35) 98888-0001' })
  @IsOptional()
  @IsString()
  clienteTelefone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endereco?: string;

  @ApiPropertyOptional({ enum: StatusObra, default: StatusObra.ORCAMENTO })
  @IsOptional()
  @IsEnum(StatusObra)
  status?: StatusObra;

  @ApiProperty({ example: 8500 })
  @IsNumber()
  @Min(0)
  valorTotal!: number;

  @ApiPropertyOptional({ description: 'URL da planta baixa enviada pelo cliente' })
  @IsOptional()
  @IsString()
  plantaBaixaUrl?: string;

  @ApiPropertyOptional({ type: PagamentoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PagamentoDto)
  pagamento?: PagamentoDto;

  @ApiPropertyOptional({ type: [AlocacaoGesseiroDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => AlocacaoGesseiroDto)
  gesseiros?: AlocacaoGesseiroDto[];

  @ApiPropertyOptional({
    type: [MaterialPrevistoDto],
    description: 'Materiais que a obra deve consumir, gravados junto com a obra',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MaterialPrevistoDto)
  materiaisPrevistos?: MaterialPrevistoDto[];
}
