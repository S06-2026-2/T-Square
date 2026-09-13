import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateObraDto } from './create-obra.dto';

/**
 * Todos os campos de criacao viram opcionais, exceto a lista de gesseiros:
 * a alocacao e gerenciada pelos endpoints dedicados
 * (POST/DELETE /obras/:id/gesseiros) para nao apagar vinculos sem querer.
 */
export class UpdateObraDto extends PartialType(OmitType(CreateObraDto, ['gesseiros'] as const)) {}
