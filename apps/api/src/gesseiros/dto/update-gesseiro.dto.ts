import { PartialType } from '@nestjs/swagger';
import { CreateGesseiroDto } from './create-gesseiro.dto';

export class UpdateGesseiroDto extends PartialType(CreateGesseiroDto) {}
