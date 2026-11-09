import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, TipoMovimentacao } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { EstoqueService } from './estoque.service';

/**
 * Cobre os cenarios de .claude/specs/features/estoque-materiais-movimentacao/spec.md
 * O Prisma e substituido por um mock, entao a suite roda sem banco.
 */
describe('EstoqueService', () => {
  let service: EstoqueService;
  let prisma: {
    material: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    obra: { findUnique: jest.Mock };
    movimentacaoEstoque: { findMany: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
  };
  // Cliente da transacao: um objeto DIFERENTE do prisma, para o teste distinguir uma escrita
  // feita dentro da transacao (tx.*) de uma feita fora dela (this.prisma.*).
  let tx: {
    material: { update: jest.Mock; updateMany: jest.Mock };
    movimentacaoEstoque: { create: jest.Mock };
  };
  // Escritas da transacao que foram de fato aguardadas, na ordem em que rodaram.
  let executadas: string[];

  const dec = (valor: number) => new Prisma.Decimal(valor);

  /**
   * O Prisma real devolve promessas "preguicosas": a query so roda quando alguem da await nela.
   * Esta imitacao so registra a escrita em `executadas` quando ela e aguardada, entao um `await`
   * esquecido no service faz o teste falhar em vez de passar despercebido.
   */
  const preguicosa = (nome: string, valor: unknown) => ({
    then(resolve?: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
      executadas.push(nome);
      return Promise.resolve(valor).then(resolve, reject);
    },
  });

  /** Troca o valor que uma escrita da transacao devolve, mantendo-a preguicosa. */
  const devolve = (mock: jest.Mock, nome: string, valor: unknown) =>
    mock.mockImplementation(() => preguicosa(nome, valor));

  beforeEach(async () => {
    executadas = [];
    tx = {
      material: {
        update: jest.fn(() => preguicosa('material.update', {})),
        updateMany: jest.fn(() => preguicosa('material.updateMany', { count: 1 })),
      },
      movimentacaoEstoque: {
        create: jest.fn(() => preguicosa('movimentacaoEstoque.create', { id: 'mov-tx' })),
      },
    };
    prisma = {
      material: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      obra: { findUnique: jest.fn() },
      movimentacaoEstoque: { findMany: jest.fn(), create: jest.fn() },
      // Executa o callback da transacao com o tx proprio, nunca com o prisma.
      $transaction: jest.fn((callback: (cliente: unknown) => unknown) => callback(tx)),
    };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [EstoqueService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = modulo.get<EstoqueService>(EstoqueService);
  });

  it('deve ser definido', () => {
    expect(service).toBeDefined();
  });

  // ---------------------------------------------------------------- EST-01/02
  describe('criarMaterial', () => {
    it('cria o material usando estoqueMinimo 0 quando omitido (EST-01)', async () => {
      prisma.material.create.mockResolvedValue({ id: 'm-1', nome: 'Cal', saldoAtual: dec(0) });

      const resultado = await service.criarMaterial({ nome: 'Cal', unidade: 'saco' });

      expect(prisma.material.create).toHaveBeenCalledWith({
        data: { nome: 'Cal', unidade: 'saco', estoqueMinimo: 0 },
      });
      expect(Number(resultado.saldoAtual)).toBe(0);
    });

    it('respeita o estoqueMinimo informado', async () => {
      prisma.material.create.mockResolvedValue({ id: 'm-2' });

      await service.criarMaterial({ nome: 'Gesso', unidade: 'saco', estoqueMinimo: 20 });

      expect(prisma.material.create).toHaveBeenCalledWith({
        data: { nome: 'Gesso', unidade: 'saco', estoqueMinimo: 20 },
      });
    });

    it('retorna 409 quando ja existe material com o mesmo nome (EST-02)', async () => {
      prisma.material.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(service.criarMaterial({ nome: 'Cal', unidade: 'saco' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('nao mascara erros inesperados como 409', async () => {
      prisma.material.create.mockRejectedValue(new Error('conexao perdida'));

      await expect(service.criarMaterial({ nome: 'Cal', unidade: 'saco' })).rejects.toThrow(
        'conexao perdida',
      );
    });

    it('so traduz para 409 o nome duplicado (P2002); outro erro conhecido do Prisma segue', async () => {
      const erroDeChaveEstrangeira = new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed',
        { code: 'P2003', clientVersion: 'test' },
      );
      prisma.material.create.mockRejectedValue(erroDeChaveEstrangeira);

      await expect(service.criarMaterial({ nome: 'Cal', unidade: 'saco' })).rejects.toBe(
        erroDeChaveEstrangeira,
      );
    });
  });

  // ---------------------------------------------------------------- EST-03..07
  describe('movimentar', () => {
    const material = { id: 'm-1', nome: 'Cal', saldoAtual: dec(10), estoqueMinimo: dec(5) };

    beforeEach(() => {
      prisma.material.findUnique.mockResolvedValue(material);
    });

    it('ENTRADA cria a movimentacao e incrementa o saldo na mesma transacao (EST-03)', async () => {
      await service.movimentar({ materialId: 'm-1', tipo: TipoMovimentacao.ENTRADA, quantidade: 5 });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.material.update).toHaveBeenCalledWith({
        where: { id: 'm-1' },
        data: { saldoAtual: { increment: 5 } },
      });
      expect(tx.movimentacaoEstoque.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            materialId: 'm-1',
            tipo: TipoMovimentacao.ENTRADA,
            quantidade: 5,
          }),
        }),
      );
      // As duas escritas rodaram dentro da transacao, aguardadas, e nenhuma escapou para fora dela.
      expect(executadas).toEqual(['material.update', 'movimentacaoEstoque.create']);
      expect(prisma.material.update).not.toHaveBeenCalled();
      expect(prisma.movimentacaoEstoque.create).not.toHaveBeenCalled();
    });

    it('ENTRADA em material com saldo 0 e aceita (a checagem de saldo vale so para SAIDA)', async () => {
      prisma.material.findUnique.mockResolvedValue({ ...material, saldoAtual: dec(0) });

      await expect(
        service.movimentar({ materialId: 'm-1', tipo: TipoMovimentacao.ENTRADA, quantidade: 20 }),
      ).resolves.toBeDefined();

      expect(tx.material.update).toHaveBeenCalledWith({
        where: { id: 'm-1' },
        data: { saldoAtual: { increment: 20 } },
      });
    });

    it('se gravar a movimentacao falhar, o erro sai da transacao para o Prisma desfazer o saldo', async () => {
      tx.movimentacaoEstoque.create.mockRejectedValue(new Error('falha ao gravar'));

      await expect(
        service.movimentar({ materialId: 'm-1', tipo: TipoMovimentacao.ENTRADA, quantidade: 5 }),
      ).rejects.toThrow('falha ao gravar');

      // O saldo ja tinha sido alterado dentro da transacao; e o erro escapando dela que faz o rollback.
      expect(executadas).toEqual(['material.update']);
    });

    it('SAIDA dentro do saldo decrementa e registra a movimentacao (EST-04)', async () => {
      devolve(tx.movimentacaoEstoque.create, 'movimentacaoEstoque.create', { id: 'mov-2' });

      const resultado = await service.movimentar({
        materialId: 'm-1',
        tipo: TipoMovimentacao.SAIDA,
        quantidade: 5,
      });

      expect(tx.material.updateMany).toHaveBeenCalledWith({
        where: { id: 'm-1', saldoAtual: { gte: 5 } },
        data: { saldoAtual: { decrement: 5 } },
      });
      // A SAIDA e gravada como SAIDA e com quantidade positiva: quem da o sinal e o tipo.
      expect(tx.movimentacaoEstoque.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            materialId: 'm-1',
            tipo: TipoMovimentacao.SAIDA,
            quantidade: 5,
          }),
        }),
      );
      expect(executadas).toEqual(['material.updateMany', 'movimentacaoEstoque.create']);
      expect(prisma.material.updateMany).not.toHaveBeenCalled();
      expect(resultado).toEqual({ id: 'mov-2' });
    });

    it('SAIDA exatamente igual ao saldo e permitida (saldo vai a zero)', async () => {
      await expect(
        service.movimentar({ materialId: 'm-1', tipo: TipoMovimentacao.SAIDA, quantidade: 10 }),
      ).resolves.toBeDefined();
    });

    it('SAIDA maior que o saldo retorna 400 sem gravar nada (EST-05)', async () => {
      await expect(
        service.movimentar({ materialId: 'm-1', tipo: TipoMovimentacao.SAIDA, quantidade: 100 }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.material.updateMany).not.toHaveBeenCalled();
      expect(tx.movimentacaoEstoque.create).not.toHaveBeenCalled();
    });

    it('SAIDA concorrente: se o saldo acabou entre a leitura e a transacao, recusa e nao grava (EST-05)', async () => {
      // A leitura inicial viu saldo 10, mas o UPDATE condicional nao encontrou saldo suficiente.
      devolve(tx.material.updateMany, 'material.updateMany', { count: 0 });

      await expect(
        service.movimentar({ materialId: 'm-1', tipo: TipoMovimentacao.SAIDA, quantidade: 8 }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(tx.movimentacaoEstoque.create).not.toHaveBeenCalled();
    });

    it('retorna 404 quando o material nao existe (EST-06)', async () => {
      prisma.material.findUnique.mockResolvedValue(null);

      await expect(
        service.movimentar({ materialId: 'nao-existe', tipo: TipoMovimentacao.ENTRADA, quantidade: 1 }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('retorna 404 quando a obra informada nao existe (EST-07)', async () => {
      prisma.obra.findUnique.mockResolvedValue(null);

      await expect(
        service.movimentar({
          materialId: 'm-1',
          obraId: 'obra-fantasma',
          tipo: TipoMovimentacao.SAIDA,
          quantidade: 1,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it.each(['CONCLUIDA', 'CANCELADA'])(
      'SAIDA para obra %s retorna 400 sem gravar nada (EST-09)',
      async (status) => {
        prisma.obra.findUnique.mockResolvedValue({ id: 'obra-1', status });

        await expect(
          service.movimentar({
            materialId: 'm-1',
            obraId: 'obra-1',
            tipo: TipoMovimentacao.SAIDA,
            quantidade: 1,
          }),
        ).rejects.toBeInstanceOf(BadRequestException);

        expect(prisma.$transaction).not.toHaveBeenCalled();
      },
    );

    it('ENTRADA (devolucao) para obra CONCLUIDA continua aceita (EST-09)', async () => {
      prisma.obra.findUnique.mockResolvedValue({ id: 'obra-1', status: 'CONCLUIDA' });

      await service.movimentar({
        materialId: 'm-1',
        obraId: 'obra-1',
        tipo: TipoMovimentacao.ENTRADA,
        quantidade: 2,
      });

      expect(tx.movimentacaoEstoque.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ obraId: 'obra-1' }) }),
      );
    });

    it('aceita obra existente e a vincula a movimentacao', async () => {
      prisma.obra.findUnique.mockResolvedValue({ id: 'obra-1', status: 'ANDAMENTO' });

      await service.movimentar({
        materialId: 'm-1',
        obraId: 'obra-1',
        tipo: TipoMovimentacao.SAIDA,
        quantidade: 2,
      });

      expect(tx.movimentacaoEstoque.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ obraId: 'obra-1' }) }),
      );
    });

    it('nao consulta obra quando obraId nao e informado', async () => {
      await service.movimentar({ materialId: 'm-1', tipo: TipoMovimentacao.ENTRADA, quantidade: 1 });

      expect(prisma.obra.findUnique).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------- listagens
  describe('listarMovimentacoes', () => {
    beforeEach(() => {
      prisma.movimentacaoEstoque.findMany.mockResolvedValue([]);
    });

    it('filtra pelo material quando materialId e informado', async () => {
      await service.listarMovimentacoes('m-1');

      expect(prisma.movimentacaoEstoque.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { materialId: 'm-1' } }),
      );
    });

    it('sem materialId, nao filtra', async () => {
      await service.listarMovimentacoes();

      expect(prisma.movimentacaoEstoque.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: undefined }),
      );
    });
  });

  // ---------------------------------------------------------------- EST-08
  describe('abaixoDoMinimo', () => {
    it('lista materiais com saldo menor ou igual ao minimo (EST-08)', async () => {
      prisma.material.findMany.mockResolvedValue([
        { id: 'a', nome: 'Abaixo', saldoAtual: dec(2), estoqueMinimo: dec(5) },
        { id: 'b', nome: 'Igual', saldoAtual: dec(5), estoqueMinimo: dec(5) },
        { id: 'c', nome: 'Acima', saldoAtual: dec(10), estoqueMinimo: dec(5) },
      ]);

      const alertas = await service.abaixoDoMinimo();

      expect(alertas.map((m) => m.id)).toEqual(['a', 'b']);
    });

    it('retorna lista vazia, sem erro, quando nenhum material esta abaixo do minimo', async () => {
      prisma.material.findMany.mockResolvedValue([
        { id: 'c', nome: 'Acima', saldoAtual: dec(10), estoqueMinimo: dec(5) },
      ]);

      await expect(service.abaixoDoMinimo()).resolves.toEqual([]);
    });
  });

  // ------------------------------------------- pwa-instalavel-responsivo (AD-009)
  /**
   * Com o `tx` da transacao de idempotencia, nada vai para o `prisma` do service e o
   * `movimentar` nao abre uma segunda $transaction (o Prisma nao aninha transacoes).
   */
  describe('com tx externo', () => {
    const material = { id: 'm-1', nome: 'Cal', saldoAtual: dec(10), estoqueMinimo: dec(5) };
    let tx: {
      material: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
      obra: { findUnique: jest.Mock };
      movimentacaoEstoque: { create: jest.Mock };
    };

    /** Nenhum metodo do `prisma` do service foi chamado, inclusive o $transaction. */
    const prismaIntocado = () => {
      expect(prisma.$transaction).not.toHaveBeenCalled();
      for (const [nome, delegate] of Object.entries(prisma)) {
        if (nome === '$transaction') continue;
        for (const metodo of Object.values(delegate as Record<string, jest.Mock>)) {
          expect(metodo).not.toHaveBeenCalled();
        }
      }
    };

    beforeEach(() => {
      tx = {
        material: {
          findUnique: jest.fn().mockResolvedValue(material),
          create: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn(),
        },
        obra: { findUnique: jest.fn() },
        movimentacaoEstoque: { create: jest.fn().mockResolvedValue({ id: 'mov-1' }) },
      };
    });

    it('movimentar(dto, tx) ENTRADA roda no tx e nao abre $transaction', async () => {
      const resultado = await service.movimentar(
        { materialId: 'm-1', tipo: TipoMovimentacao.ENTRADA, quantidade: 5 },
        tx as never,
      );

      expect(tx.material.findUnique).toHaveBeenCalledWith({ where: { id: 'm-1' } });
      expect(tx.material.update).toHaveBeenCalledWith({
        where: { id: 'm-1' },
        data: { saldoAtual: { increment: 5 } },
      });
      expect(tx.movimentacaoEstoque.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ materialId: 'm-1', tipo: TipoMovimentacao.ENTRADA, quantidade: 5 }),
        }),
      );
      expect(resultado).toEqual({ id: 'mov-1' });
      prismaIntocado();
    });

    it('movimentar(dto, tx) SAIDA com obra valida a obra e aplica a guarda de saldo no tx', async () => {
      tx.obra.findUnique.mockResolvedValue({ id: 'o-1', status: 'ANDAMENTO' });
      tx.material.updateMany.mockResolvedValue({ count: 1 });

      await service.movimentar(
        { materialId: 'm-1', tipo: TipoMovimentacao.SAIDA, quantidade: 4, obraId: 'o-1' },
        tx as never,
      );

      expect(tx.obra.findUnique).toHaveBeenCalledWith({ where: { id: 'o-1' } });
      expect(tx.material.updateMany).toHaveBeenCalledWith({
        where: { id: 'm-1', saldoAtual: { gte: 4 } },
        data: { saldoAtual: { decrement: 4 } },
      });
      expect(tx.movimentacaoEstoque.create).toHaveBeenCalledTimes(1);
      prismaIntocado();
    });

    it('movimentar(dto, tx) SAIDA na corrida (count === 0) recusa e nao grava a movimentacao', async () => {
      tx.material.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.movimentar(
          { materialId: 'm-1', tipo: TipoMovimentacao.SAIDA, quantidade: 8 },
          tx as never,
        ),
      ).rejects.toThrow('Saldo insuficiente de "Cal": disponivel 10, solicitado 8');

      expect(tx.movimentacaoEstoque.create).not.toHaveBeenCalled();
      prismaIntocado();
    });

    it('criarMaterial com tx grava pelo tx', async () => {
      tx.material.create.mockResolvedValue({ id: 'm-2' });

      const resultado = await service.criarMaterial({ nome: 'Cal', unidade: 'saco' }, tx as never);

      expect(tx.material.create).toHaveBeenCalledWith({
        data: { nome: 'Cal', unidade: 'saco', estoqueMinimo: 0 },
      });
      expect(resultado).toEqual({ id: 'm-2' });
      prismaIntocado();
    });

    it('criarMaterial com tx: P2002 continua virando o mesmo 409', async () => {
      tx.material.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      const promessa = service.criarMaterial({ nome: 'Cal', unidade: 'saco' }, tx as never);

      await expect(promessa).rejects.toBeInstanceOf(ConflictException);
      await expect(promessa).rejects.toThrow('Ja existe um material chamado "Cal"');
    });
  });
});
