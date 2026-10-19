import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { usuario: { findUnique: jest.Mock; create: jest.Mock } };
  let jwt: { sign: jest.Mock };

  // O bcrypt roda de verdade aqui: ele nao e um detalhe de infraestrutura,
  // ele e o proprio assunto do teste.
  const SENHA = 'senhaCorreta123';
  let hashReal: string;

  beforeAll(async () => {
    hashReal = await bcrypt.hash(SENHA, 10);
  });

  beforeEach(async () => {
    prisma = { usuario: { findUnique: jest.fn(), create: jest.fn() } };
    jwt = { sign: jest.fn().mockReturnValue('token-fake') };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();

    service = modulo.get<AuthService>(AuthService);
  });

  const usuario = (extra: Record<string, unknown> = {}) => ({
    id: 'u-1',
    nome: 'Andre',
    email: 'andre@gesso.com',
    papel: 'OPERADOR',
    ativo: true,
    senhaHash: hashReal,
    ...extra,
  });

  describe('register', () => {
    it('nunca guarda a senha em texto puro', async () => {
      prisma.usuario.findUnique.mockResolvedValue(null);
      prisma.usuario.create.mockResolvedValue({
        id: 'u-1',
        nome: 'Andre',
        email: 'andre@gesso.com',
        papel: 'OPERADOR',
      });

      await service.register({ nome: 'Andre', email: 'andre@gesso.com', senha: SENHA });

      const gravado = prisma.usuario.create.mock.calls[0][0].data;

      expect(gravado.senhaHash).not.toBe(SENHA);
      expect(gravado).not.toHaveProperty('senha');
      // e o que foi gravado e um hash valido DAQUELA senha
      await expect(bcrypt.compare(SENHA, gravado.senhaHash)).resolves.toBe(true);
    });

    it('recusa e-mail ja cadastrado com 409 e nao cria nada', async () => {
      prisma.usuario.findUnique.mockResolvedValue({ id: 'u-1', email: 'andre@gesso.com' });

      await expect(
        service.register({ nome: 'Andre', email: 'andre@gesso.com', senha: SENHA }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.usuario.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('devolve o token e os dados do usuario, sem o hash da senha', async () => {
      prisma.usuario.findUnique.mockResolvedValue(usuario());

      const resultado = await service.login({ email: 'andre@gesso.com', senha: SENHA });

      expect(jwt.sign).toHaveBeenCalledWith({
        sub: 'u-1',
        email: 'andre@gesso.com',
        papel: 'OPERADOR',
      });
      expect(resultado.accessToken).toBe('token-fake');
      expect(resultado.usuario).toEqual({
        id: 'u-1',
        nome: 'Andre',
        email: 'andre@gesso.com',
        papel: 'OPERADOR',
      });
      expect(resultado.usuario).not.toHaveProperty('senhaHash');
    });

    it('recusa senha errada', async () => {
      prisma.usuario.findUnique.mockResolvedValue(usuario());

      await expect(
        service.login({ email: 'andre@gesso.com', senha: 'senhaErrada' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('recusa e-mail que nao existe', async () => {
      prisma.usuario.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'ninguem@gesso.com', senha: SENHA }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('recusa usuario desativado, mesmo com a senha certa', async () => {
      prisma.usuario.findUnique.mockResolvedValue(usuario({ ativo: false }));

      await expect(
        service.login({ email: 'andre@gesso.com', senha: SENHA }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('usa a MESMA mensagem para e-mail inexistente e para senha errada', async () => {
      prisma.usuario.findUnique.mockResolvedValue(null);
      const erroEmail = await service
        .login({ email: 'ninguem@gesso.com', senha: SENHA })
        .catch((e) => e);

      prisma.usuario.findUnique.mockResolvedValue(usuario());
      const erroSenha = await service
        .login({ email: 'andre@gesso.com', senha: 'senhaErrada' })
        .catch((e) => e);

      // Mensagens diferentes contariam a um atacante quais e-mails existem
      // no sistema. Este teste existe para impedir essa "melhoria".
      expect(erroEmail.message).toBe(erroSenha.message);
    });
  });
});