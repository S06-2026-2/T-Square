import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const jaExiste = await this.prisma.usuario.findUnique({ where: { email: dto.email } });
    if (jaExiste) {
      throw new ConflictException('Ja existe um usuario com esse e-mail');
    }

    const usuario = await this.prisma.usuario.create({
      data: {
        nome: dto.nome,
        email: dto.email,
        senhaHash: await bcrypt.hash(dto.senha, 10),
        papel: dto.papel,
      },
    });

    return this.gerarToken(usuario.id, usuario.email, usuario.papel, usuario.nome);
  }

  async login(dto: LoginDto) {
    const usuario = await this.prisma.usuario.findUnique({ where: { email: dto.email } });

    if (!usuario || !usuario.ativo) {
      throw new UnauthorizedException('Credenciais invalidas');
    }

    const senhaConfere = await bcrypt.compare(dto.senha, usuario.senhaHash);
    if (!senhaConfere) {
      throw new UnauthorizedException('Credenciais invalidas');
    }

    return this.gerarToken(usuario.id, usuario.email, usuario.papel, usuario.nome);
  }

  private gerarToken(id: string, email: string, papel: string, nome: string) {
    return {
      accessToken: this.jwt.sign({ sub: id, email, papel }),
      usuario: { id, nome, email, papel },
    };
  }
}
