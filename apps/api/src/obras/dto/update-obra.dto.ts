import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min } from 'class-validator';

import { CreateObraDto } from './create-obra.dto';

/**
 * Todos os campos de criacao viram opcionais, exceto a lista de gesseiros:
 * a alocacao e gerenciada pelos endpoints dedicados
 * (POST/DELETE /obras/:id/gesseiros) para nao apagar vinculos sem querer.
 * Os materiais previstos tambem ficam de fora: PUT /obras/:id/materiais-previstos.
 */
export class UpdateObraDto extends PartialType(
  OmitType(CreateObraDto, ['gesseiros', 'materiaisPrevistos'] as const),
) {
  /**
   * Quanto o cliente ja pagou (ARQ-01). So existe no PATCH: a obra nasce com 0. O teto
   * (valorTotal) e conferido no service, porque depende do valor gravado.
   */
  @ApiPropertyOptional({ example: 4250.5, minimum: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  valorRecebido?: number;
}
