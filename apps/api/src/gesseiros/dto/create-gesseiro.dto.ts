import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateGesseiroDto {
  @ApiProperty({ example: 'Joao Ferreira' })
  @IsString()
  @MinLength(3)
  nome!: string;

  @ApiPropertyOptional({ example: '(35) 99999-0001' })
  @IsOptional()
  @IsString()
  telefone?: string;

  @ApiPropertyOptional({ example: 'joao@pix.com' })
  @IsOptional()
  @IsString()
  chavePix?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
