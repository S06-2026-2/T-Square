import { Module } from '@nestjs/common';
import { MateriaisPrevistosService } from './materiais-previstos.service';
import { ObrasController } from './obras.controller';
import { ObrasService } from './obras.service';

@Module({
  controllers: [ObrasController],
  providers: [ObrasService, MateriaisPrevistosService],
  exports: [ObrasService],
})
export class ObrasModule {}
