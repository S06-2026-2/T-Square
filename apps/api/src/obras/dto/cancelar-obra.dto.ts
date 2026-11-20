import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

/** Corpo de PATCH /obras/:id/cancelar (TRN-09, P2 AC1/AC3). */
export class CancelarObraDto {
  @ApiProperty({
    example: 'Cliente desistiu',
    minLength: 3,
    maxLength: 500,
    description: 'Motivo do cancelamento, de 3 a 500 caracteres depois de tirar os espaços das pontas',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(3, 500)
  motivo!: string;
}
