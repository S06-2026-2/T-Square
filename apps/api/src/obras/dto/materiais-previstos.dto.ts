import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsString, Min, ValidateNested } from 'class-validator';

/** Um material que a obra deve consumir. Quantidade vira Decimal(12,2) no banco. */
export class MaterialPrevistoDto {
  @ApiProperty({ description: 'ID do material previsto' })
  @IsString()
  materialId!: string;

  @ApiProperty({ example: 20, description: 'Quantidade prevista (> 0, no máximo 2 casas decimais)' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  quantidade!: number;
}

/** Lista completa de previstos da obra. Lista vazia remove todos. */
export class SubstituirMateriaisPrevistosDto {
  @ApiProperty({ type: [MaterialPrevistoDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MaterialPrevistoDto)
  itens!: MaterialPrevistoDto[];
}
