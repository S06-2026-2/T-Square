import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Papel } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Andre Augusto' })
  @IsString()
  @MinLength(3)
  nome!: string;

  @ApiProperty({ example: 'andre@gesso.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'senhaForte123' })
  @IsString()
  @MinLength(6)
  senha!: string;

  @ApiPropertyOptional({ enum: Papel, default: Papel.OPERADOR })
  @IsOptional()
  @IsEnum(Papel)
  papel?: Papel;
}
