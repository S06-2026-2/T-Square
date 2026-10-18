import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StatusObra, TipoLancamento } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { GesseirosService } from './gesseiros.service';

/**
 * Cobre a spec .claude/specs/features/gesseiros-crud-financeiro/spec.md
 * (GES-01 a GES-08). Mesmo padrao de obras.service.spec.ts: Prisma mockado, sem banco real.
 */
describe('GesseirosService', () => {
  let service: GesseirosService;
  let prisma: {
    gesseiro: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    lancamento: { create: jest.Mock; groupBy: jest.Mock };
    obra: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      gesseiro: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      lancamento: { create: jest.fn(), groupBy: jest.fn() },
      obra: { findUnique: jest.fn() },
    };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [GesseirosService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = modulo.get<GesseirosService>(GesseirosService);
  });

  it('deve ser definido', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('cria o gesseiro com os dados do DTO', async () => {
      const dto = { nome: 'Joao Ferreira', telefone: '(35) 99999-0001' };
      prisma.gesseiro.create.mockResolvedValue({ id: 'g-1', ativo: true, ...dto });

      const resultado = await service.create(dto);

      expect(prisma.gesseiro.create).toHaveBeenCalledWith({ data: dto });
      expect(resultado).toEqual(expect.objectContaining({ id: 'g-1', nome: 'Joao Ferreira' }));
    });
  });

  describe('registrarLancamento', () => {
    it('registra um VALE com sucesso', async () => {
      prisma.gesseiro.findUnique.mockResolvedValue({ id: 'g-1', lancamentos: [] });
      prisma.lancamento.create.mockResolvedValue({
        id: 'l-1',
        gesseiroId: 'g-1',
        tipo: TipoLancamento.VALE,
        valor: 100,
      });

      const resultado = await service.registrarLancamento('g-1', {
        tipo: TipoLancamento.VALE,
        valor: 100,
      });

      expect(prisma.lancamento.create).toHaveBeenCalledWith({
        data: { gesseiroId: 'g-1', tipo: TipoLancamento.VALE, valor: 100 },
      });
      expect(resultado.tipo).toBe(TipoLancamento.VALE);
    });

    it('registra um PAGAMENTO com sucesso', async () => {
      prisma.gesseiro.findUnique.mockResolvedValue({ id: 'g-1', lancamentos: [] });
      prisma.lancamento.create.mockResolvedValue({
        id: 'l-2',
        gesseiroId: 'g-1',
        tipo: TipoLancamento.PAGAMENTO,
        valor: 50,
      });

      await service.registrarLancamento('g-1', { tipo: TipoLancamento.PAGAMENTO, valor: 50 });

      expect(prisma.lancamento.create).toHaveBeenCalledWith({
        data: { gesseiroId: 'g-1', tipo: TipoLancamento.PAGAMENTO, valor: 50 },
      });
    });

    it('rejeita a criacao manual de CREDITO', async () => {
      await expect(
        service.registrarLancamento('g-1', { tipo: TipoLancamento.CREDITO, valor: 100 }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.gesseiro.findUnique).not.toHaveBeenCalled();
      expect(prisma.lancamento.create).not.toHaveBeenCalled();
    });

    it('rejeita valor menor ou igual a zero', async () => {
      await expect(
        service.registrarLancamento('g-1', { tipo: TipoLancamento.VALE, valor: 0 }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.lancamento.create).not.toHaveBeenCalled();
    });

    it('lanca 404 quando o gesseiro nao existe', async () => {
      prisma.gesseiro.findUnique.mockResolvedValue(null);

      await expect(
        service.registrarLancamento('nao-existe', { tipo: TipoLancamento.VALE, valor: 100 }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.lancamento.create).not.toHaveBeenCalled();
    });

    it('lanca 404 quando a obraId informada nao existe', async () => {
      prisma.gesseiro.findUnique.mockResolvedValue({ id: 'g-1', lancamentos: [] });
      prisma.obra.findUnique.mockResolvedValue(null);

      await expect(
        service.registrarLancamento('g-1', {
          tipo: TipoLancamento.VALE,
          valor: 100,
          obraId: 'obra-inexistente',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.lancamento.create).not.toHaveBeenCalled();
    });
  });

  // GES-07 ------------------------------------------------------------------

  describe('update', () => {
    it('rejeita PATCH sem nenhum campo, antes de consultar o banco', async () => {
      await expect(service.update('g-1', {})).rejects.toBeInstanceOf(BadRequestException);

      // a validacao barata roda antes da consulta cara: o banco nem e tocado
      expect(prisma.gesseiro.findUnique).not.toHaveBeenCalled();
      expect(prisma.gesseiro.update).not.toHaveBeenCalled();
    });

    it('atualiza apenas os campos enviados', async () => {
      prisma.gesseiro.findUnique.mockResolvedValue({
        id: 'g-1',
        nome: 'Joao Ferreira',
        telefone: '(35) 99999-0001',
        ativo: true,
        alocacoes: [],
        lancamentos: [],
      });
      prisma.gesseiro.update.mockResolvedValue({
        id: 'g-1',
        nome: 'Joao Ferreira',
        telefone: '(35) 98888-7777',
        ativo: true,
      });

      const resultado = await service.update('g-1', { telefone: '(35) 98888-7777' });

      expect(prisma.gesseiro.update).toHaveBeenCalledWith({
        where: { id: 'g-1' },
        data: { telefone: '(35) 98888-7777' },
      });
      expect(resultado.nome).toBe('Joao Ferreira');
      expect(resultado.ativo).toBe(true);
      expect(resultado.telefone).toBe('(35) 98888-7777');
    });

    it('lanca 404 quando o gesseiro nao existe', async () => {
      prisma.gesseiro.findUnique.mockResolvedValue(null);

      await expect(
        service.update('nao-existe', { telefone: '(35) 98888-7777' }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.gesseiro.update).not.toHaveBeenCalled();
    });
  });

  // GES-08 ------------------------------------------------------------------

  describe('remove', () => {
    it('desativa o gesseiro sem apagar a linha', async () => {
      prisma.gesseiro.findUnique.mockResolvedValue({
        id: 'g-1',
        nome: 'Joao Ferreira',
        ativo: true,
        alocacoes: [],
        lancamentos: [],
      });
      prisma.gesseiro.update.mockResolvedValue({ id: 'g-1', nome: 'Joao Ferreira', ativo: false });

      const resultado = await service.remove('g-1');

      expect(prisma.gesseiro.update).toHaveBeenCalledWith({
        where: { id: 'g-1' },
        data: { ativo: false },
      });
      // o historico financeiro depende da linha continuar existindo
      expect(prisma.gesseiro.delete).not.toHaveBeenCalled();
      expect(resultado.ativo).toBe(false);
    });

    it('nao falha ao desativar quem ja esta inativo', async () => {
      prisma.gesseiro.findUnique.mockResolvedValue({
        id: 'g-1',
        nome: 'Joao Ferreira',
        ativo: false,
        // mesmo com obra em aberto: quem ja esta inativo nao esta sendo desativado agora
        alocacoes: [{ obra: { titulo: 'Forro Residencia Silva', status: StatusObra.ANDAMENTO } }],
        lancamentos: [],
      });

      const resultado = await service.remove('g-1');

      expect(prisma.gesseiro.update).not.toHaveBeenCalled();
      expect(resultado.ativo).toBe(false);
      // mesmo formato do caminho que desativa: sem as listas do include
      expect(resultado).not.toHaveProperty('alocacoes');
      expect(resultado).not.toHaveProperty('lancamentos');
    });

    it('recusa enquanto houver alocacao em obra nao terminada', async () => {
      prisma.gesseiro.findUnique.mockResolvedValue({
        id: 'g-1',
        nome: 'Joao Ferreira',
        ativo: true,
        alocacoes: [
          { obra: { titulo: 'Forro Residencia Silva', status: StatusObra.CONCLUIDA } },
          { obra: { titulo: 'Drywall Escritorio Centro', status: StatusObra.ANDAMENTO } },
        ],
        lancamentos: [],
      });

      await expect(service.remove('g-1')).rejects.toBeInstanceOf(BadRequestException);

      // a mensagem cita so a obra que impede, nao a que ja terminou
      await expect(service.remove('g-1')).rejects.toThrow('Drywall Escritorio Centro');
      await expect(service.remove('g-1')).rejects.not.toThrow('Forro Residencia Silva');

      expect(prisma.gesseiro.update).not.toHaveBeenCalled();
      expect(prisma.gesseiro.delete).not.toHaveBeenCalled();
    });

    it('lanca 404 quando o gesseiro nao existe', async () => {
      prisma.gesseiro.findUnique.mockResolvedValue(null);

      await expect(service.remove('nao-existe')).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.gesseiro.update).not.toHaveBeenCalled();
      expect(prisma.gesseiro.delete).not.toHaveBeenCalled();
    });

    it('bloqueia tambem por obra em ORCAMENTO ou FECHADA, nao so ANDAMENTO', async () => {
      prisma.gesseiro.findUnique.mockResolvedValue({
        id: 'g-1',
        nome: 'Joao Ferreira',
        ativo: true,
        alocacoes: [
          { obra: { titulo: 'Sanca Apto 302', status: StatusObra.ORCAMENTO } },
          { obra: { titulo: 'Forro Loja Centro', status: StatusObra.FECHADA } },
        ],
        lancamentos: [],
      });

      const chamada = service.remove('g-1');

      await expect(chamada).rejects.toBeInstanceOf(BadRequestException);
      await expect(chamada).rejects.toThrow('Sanca Apto 302');
      await expect(chamada).rejects.toThrow('Forro Loja Centro');

      expect(prisma.gesseiro.update).not.toHaveBeenCalled();
    });

    it('nao bloqueia por obra CANCELADA', async () => {
      prisma.gesseiro.findUnique.mockResolvedValue({
        id: 'g-1',
        nome: 'Joao Ferreira',
        ativo: true,
        alocacoes: [{ obra: { titulo: 'Obra Cancelada', status: StatusObra.CANCELADA } }],
        lancamentos: [],
      });
      prisma.gesseiro.update.mockResolvedValue({ id: 'g-1', nome: 'Joao Ferreira', ativo: false });

      const resultado = await service.remove('g-1');

      expect(resultado.ativo).toBe(false);
      expect(prisma.gesseiro.update).toHaveBeenCalledWith({
        where: { id: 'g-1' },
        data: { ativo: false },
      });
    });
  });

    // extrato -----------------------------------------------------------------

  describe('extrato', () => {
    it('calcula creditos, vales, pagamentos e o saldo a receber', async () => {
      prisma.gesseiro.findUnique.mockResolvedValue({
        id: 'g-1',
        nome: 'Joao Ferreira',
        ativo: true,
        alocacoes: [],
        lancamentos: [{ id: 'l-1' }, { id: 'l-2' }],
      });

      // O Prisma devolve Decimal como string, nao como number — por isso os
      // valores aqui sao strings. Os tres sao diferentes entre si de proposito.
      prisma.lancamento.groupBy.mockResolvedValue([
        { tipo: TipoLancamento.CREDITO, _sum: { valor: '4300.75' } },
        { tipo: TipoLancamento.VALE, _sum: { valor: '800.25' } },
        { tipo: TipoLancamento.PAGAMENTO, _sum: { valor: '0.50' } },
      ]);

      const resultado = await service.extrato('g-1');

      expect(prisma.lancamento.groupBy).toHaveBeenCalledWith({
        by: ['tipo'],
        where: { gesseiroId: 'g-1' },
        _sum: { valor: true },
      });

      expect(resultado.creditos).toBe(4300.75);
      expect(resultado.vales).toBe(800.25);
      expect(resultado.pagamentos).toBe(0.5);
      expect(resultado.saldoAReceber).toBe(3500);
      expect(resultado.gesseiro).toEqual({ id: 'g-1', nome: 'Joao Ferreira' });
      expect(resultado.lancamentos).toHaveLength(2);
    });

    it('trata como zero o tipo que nao tem nenhum lancamento', async () => {
      prisma.gesseiro.findUnique.mockResolvedValue({
        id: 'g-1',
        nome: 'Joao Ferreira',
        ativo: true,
        alocacoes: [],
        lancamentos: [],
      });

      // Gesseiro que nunca recebeu pagamento: o groupBy NAO devolve a linha de
      // PAGAMENTO — nao vem com zero, simplesmente nao vem.
      prisma.lancamento.groupBy.mockResolvedValue([
        { tipo: TipoLancamento.CREDITO, _sum: { valor: '2500' } },
        { tipo: TipoLancamento.VALE, _sum: { valor: '500' } },
      ]);

      const resultado = await service.extrato('g-1');

      expect(resultado.pagamentos).toBe(0);
      expect(resultado.saldoAReceber).toBe(2000);
    });

    it('lanca 404 quando o gesseiro nao existe, sem consultar os lancamentos', async () => {
    prisma.gesseiro.findUnique.mockResolvedValue(null);

    await expect(service.extrato('nao-existe')).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.lancamento.groupBy).not.toHaveBeenCalled();
    });
  });
});
