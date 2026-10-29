import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateObraDto } from './create-obra.dto';

/**
 * Todos os campos de criacao viram opcionais, exceto a lista de gesseiros:
 * a alocacao e gerenciada pelos endpoints dedicados
 * (POST/DELETE /obras/:id/gesseiros) para nao apagar vinculos sem querer.
 * Os materiais previstos tambem ficam de fora: PUT /obras/:id/materiais-previstos.
 */
export class UpdateObraDto extends PartialType(
  OmitType(CreateObraDto, ['gesseiros', 'materiaisPrevistos'] as const),
) {}
