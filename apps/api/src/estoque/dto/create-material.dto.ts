import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateMaterialDto {
  @ApiProperty({ example: 'Placa de gesso 1,20x1,80' })
  @IsString()
  @MinLength(2)
  nome!: string;

  @ApiProperty({ example: 'un', description: 'Unidade de medida: un, saco, m2, kg...' })
  @IsString()
  unidade!: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  estoqueMinimo?: number;
}
