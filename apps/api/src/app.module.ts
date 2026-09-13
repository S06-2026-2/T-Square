import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { ObrasModule } from './obras/obras.module';
import { GesseirosModule } from './gesseiros/gesseiros.module';
import { EstoqueModule } from './estoque/estoque.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    ObrasModule,
    GesseirosModule,
    EstoqueModule,
  ],
  controllers: [AppController],
  providers: [
    // Todas as rotas exigem JWT por padrao.
    // Use o decorator @Public() para liberar uma rota especifica.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
