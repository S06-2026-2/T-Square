import { Module } from '@nestjs/common';
import { GesseirosController } from './gesseiros.controller';
import { GesseirosService } from './gesseiros.service';

@Module({
  controllers: [GesseirosController],
  providers: [GesseirosService],
  exports: [GesseirosService],
})
export class GesseirosModule {}
