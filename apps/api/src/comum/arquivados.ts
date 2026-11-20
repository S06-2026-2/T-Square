import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * `?arquivados=true` nas listas de obras, gesseiros e materiais (ARQ-06). A query chega como texto:
 * só `true` e `false` viram booleano; qualquer outro valor fica como está e o IsBoolean recusa (400).
 */
export class QueryArquivadosDto {
  @ApiPropertyOptional({
    description: 'true: só os arquivados, do mais recente para o mais antigo',
  })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  arquivados?: boolean;
}

/** Filtro e ordem das listas: sem a flag, só os não arquivados; com ela, só os arquivados. */
export function filtroArquivados(arquivados?: boolean) {
  return arquivados
    ? { where: { arquivadoEm: { not: null } }, orderBy: { arquivadoEm: 'desc' as const } }
    : { where: { arquivadoEm: null }, orderBy: undefined };
}
