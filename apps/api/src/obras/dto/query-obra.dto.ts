import { ApiPropertyOptional } from '@nestjs/swagger';
import { StatusObra } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

import { QueryArquivadosDto } from '../../comum/arquivados';

export class QueryObraDto extends QueryArquivadosDto {
  @ApiPropertyOptional({ enum: StatusObra, description: 'Filtra o funil por status' })
  @IsOptional()
  @IsEnum(StatusObra)
  status?: StatusObra;

  @ApiPropertyOptional({ description: 'Busca por titulo ou nome do cliente' })
  @IsOptional()
  @IsString()
  busca?: string;
}
