import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StatusObra, TipoLancamento } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { MateriaisPrevistosService } from './materiais-previstos.service';
import { ObrasService } from './obras.service';

/**
 * Teste de referencia do projeto.
 * O Prisma e substituido por um mock, entao a suite roda sem banco.
 */
describe('ObrasService', () => {
  let service: ObrasService;
  let prisma: {
    obra: { findUnique: jest.Mock; update: jest.Mock; create: jest.Mock };
    material: { findMany: jest.Mock };
    lancamento: { createMany: jest.Mock };
    obraGesseiro: { findUnique: jest.Mock; delete: jest.Mock };
    $transaction: jest.Mock;
  };
  /**
   * Cliente da transacao, SEPARADO do prisma (AD-012): uma escrita feita fora da transacao cai
   * no prisma e o teste percebe.
   */
  let tx: {
    obra: { findUnique: jest.Mock; updateMany: jest.Mock; findUniqueOrThrow: jest.Mock };
    obraGesseiro: { findMany: jest.Mock };
    lancamento: Record<
      'create' | 'createMany' | 'update' | 'updateMany' | 'delete' | 'deleteMany',
      jest.Mock
    >;
  };

  beforeEach(async () => {
    tx = {
      obra: {
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn(),
      },
      obraGesseiro: { findMany: jest.fn().mockResolvedValue([]) },
      lancamento: {
        create: jest.fn(),
        createMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    prisma = {
      obra: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
      material: { findMany: jest.fn() },
      lancamento: { createMany: jest.fn() },
      obraGesseiro: { findUnique: jest.fn(), delete: jest.fn() },
      $transaction: jest.fn((callback: (t: unknown) => unknown) => callback(tx)),
    };

    // MateriaisPrevistosService real (validarItens), sobre o mesmo Prisma mockado.
    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        ObrasService,
        MateriaisPrevistosService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = modulo.get<ObrasService>(ObrasService);
  });

  it('deve ser definido', () => {
    expect(service).toBeDefined();
  });

  /** EAP-37, 40 e 42 de .claude/specs/features/estoque-agente-proativo/spec.md */
  describe('create com materiais previstos', () => {
    const dadosObra = {
      titulo: 'Forro Residencia Teste',
      clienteNome: 'Cliente Teste',
      valorTotal: 8500,
    };

    it('grava os materiais previstos aninhados na criacao da obra', async () => {
      prisma.material.findMany.mockResolvedValue([{ id: 'mat-cal' }, { id: 'mat-gesso' }]);
      prisma.obra.create.mockResolvedValue({ id: 'obra-nova' });

      const resultado = await service.create({
        ...dadosObra,
        materiaisPrevistos: [
          { materialId: 'mat-cal', quantidade: 20 },
          { materialId: 'mat-gesso', quantidade: 7.5 },
        ],
      });

      expect(prisma.obra.create).toHaveBeenCalledTimes(1);
      const { data } = prisma.obra.create.mock.calls[0][0];
      expect(data).toEqual(
        expect.objectContaining({
          ...dadosObra,
          materiaisPrevistos: {
            create: [
              { materialId: 'mat-cal', quantidade: 20 },
              { materialId: 'mat-gesso', quantidade: 7.5 },
            ],
          },
        }),
      );
      expect(resultado).toEqual({ id: 'obra-nova' });
    });

    it('sem materiais previstos mantem a criacao atual', async () => {
      prisma.obra.create.mockResolvedValue({ id: 'obra-nova' });

      await service.create({
        ...dadosObra,
        gesseiros: [{ gesseiroId: 'g-1', valorCombinado: 900 }],
      });

      expect(prisma.material.findMany).not.toHaveBeenCalled();
      const { data } = prisma.obra.create.mock.calls[0][0];
      expect(data).toEqual({
        ...dadosObra,
        pagamento: undefined,
        gesseiros: { create: [{ gesseiroId: 'g-1', valorCombinado: 900 }] },
        materiaisPrevistos: undefined,
      });
    });

    // TRN-06 (Atalhos AC1): sem status no DTO, a obra nasce ORCAMENTO pelo default do schema.
    it('create nao grava status explicito: vale o default ORCAMENTO do schema', async () => {
      prisma.obra.create.mockResolvedValue({ id: 'obra-nova', status: StatusObra.ORCAMENTO });

      await service.create(dadosObra);

      const { data } = prisma.obra.create.mock.calls[0][0];
      expect(Object.keys(data)).not.toContain('status');
    });

    it('material repetido rejeita com 400 antes de criar a obra', async () => {
      prisma.material.findMany.mockResolvedValue([{ id: 'mat-cal' }]);

      const promessa = service.create({
        ...dadosObra,
        materiaisPrevistos: [
          { materialId: 'mat-cal', quantidade: 5 },
          { materialId: 'mat-cal', quantidade: 2 },
        ],
      });

      await expect(promessa).rejects.toBeInstanceOf(BadRequestException);
      await expect(promessa).rejects.toThrow(
        'Material mat-cal aparece mais de uma vez nos materiais previstos',
      );
      expect(prisma.obra.create).not.toHaveBeenCalled();
    });

    it('material inexistente rejeita com 404 antes de criar a obra', async () => {
      prisma.material.findMany.mockResolvedValue([]);

      const promessa = service.create({
        ...dadosObra,
        materiaisPrevistos: [{ materialId: 'mat-fantasma', quantidade: 5 }],
      });

      await expect(promessa).rejects.toBeInstanceOf(NotFoundException);
      await expect(promessa).rejects.toThrow('Material mat-fantasma não encontrado');
      expect(prisma.obra.create).not.toHaveBeenCalled();
    });
  });

  /** ARQ-01 (P1: Registrar quanto o cliente pagou) de arquivar-e-limpar-registros. */
  describe('update: valorRecebido', () => {
    const atual = {
      id: 'obra-1',
      status: StatusObra.ANDAMENTO,
      valorTotal: '8500.00',
      valorRecebido: '1000.00',
    };

    beforeEach(() => {
      prisma.obra.findUnique.mockResolvedValue(atual);
      prisma.obra.update.mockResolvedValue({ ...atual });
    });

    it.each([0, 4250.5, 8500])('grava %p (até o total)', async (valorRecebido) => {
      await service.update('obra-1', { valorRecebido });

      expect(prisma.obra.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'obra-1' },
          data: expect.objectContaining({ valorRecebido }),
        }),
      );
    });

    it('acima do total: 400 com a mensagem exata, sem gravar', async () => {
      const promessa = service.update('obra-1', { valorRecebido: 8500.01 });

      await expect(promessa).rejects.toBeInstanceOf(BadRequestException);
      await expect(promessa).rejects.toThrow(
        'O valor recebido não pode passar do valor total (R$ 8.500,00)',
      );
      expect(prisma.obra.update).not.toHaveBeenCalled();
    });

    // Auditor #3/#4: o 0 enviado vale (`??`, não `||`), tanto no recebido quanto no total.
    it('valorRecebido 0 junto com um total menor que o recebido gravado: grava', async () => {
      await service.update('obra-1', { valorTotal: 500, valorRecebido: 0 });

      expect(prisma.obra.update).toHaveBeenCalledTimes(1);
    });

    it('valorTotal 0 com recebido gravado de 1000: 400 com "(R$ 0,00)"', async () => {
      await expect(service.update('obra-1', { valorTotal: 0 })).rejects.toThrow(
        'O valor recebido não pode passar do valor total (R$ 0,00)',
      );
      expect(prisma.obra.update).not.toHaveBeenCalled();
    });

    it('usa o valorTotal do mesmo PATCH quando ele vem junto', async () => {
      await service.update('obra-1', { valorTotal: 9000, valorRecebido: 9000 });
      expect(prisma.obra.update).toHaveBeenCalledTimes(1);

      await expect(
        service.update('obra-1', { valorTotal: 5000, valorRecebido: 6000 }),
      ).rejects.toThrow('O valor recebido não pode passar do valor total (R$ 5.000,00)');
    });

    it('diminuir só o total para baixo do recebido gravado: 400, sem gravar', async () => {
      await expect(service.update('obra-1', { valorTotal: 999.99 })).rejects.toThrow(
        'O valor recebido não pode passar do valor total (R$ 999,99)',
      );
      expect(prisma.obra.update).not.toHaveBeenCalled();
    });

    it('PATCH sem valores (ex.: só o cliente) continua gravando', async () => {
      await service.update('obra-1', { clienteNome: 'Outro' });

      expect(prisma.obra.update).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * TRN-01..04, TRN-07 (lado unitario), TRN-08, TRN-09 e TRN-12 de
   * .claude/specs/features/obras-transicoes-status/spec.md.
   */
  describe('transicoes de status', () => {
    const AGORA = new Date('2026-11-19T15:00:00.000Z');
    const equipe = [
      { obraId: 'obra-1', gesseiroId: 'g-1', valorCombinado: 2500 },
      { obraId: 'obra-1', gesseiroId: 'g-2', valorCombinado: 1500 },
    ];

    /** Obra lida no inicio da transacao. */
    const obraEm = (status: StatusObra, gesseiros: unknown[] = []) => ({
      id: 'obra-1',
      titulo: 'Forro Residencia Silva',
      status,
      gesseiros,
    });

    /** Prepara a leitura e a obra devolvida no fim da transicao. */
    const prepararObra = (status: StatusObra, gesseiros: unknown[] = [], depois?: StatusObra) => {
      tx.obra.findUnique.mockResolvedValueOnce(obraEm(status, gesseiros));
      tx.obra.findUniqueOrThrow.mockResolvedValue({ id: 'obra-1', status: depois ?? status });
    };

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(AGORA);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    const naoTocouLancamentos = () => {
      for (const metodo of Object.values(tx.lancamento)) {
        expect(metodo).not.toHaveBeenCalled();
      }
      expect(prisma.lancamento.createMany).not.toHaveBeenCalled();
    };

    describe('concluir (TRN-03, TRN-04, TRN-07)', () => {
      it('ANDAMENTO com 2 gesseiros: update condicional, dataConclusao e um CREDITO por gesseiro', async () => {
        prepararObra(StatusObra.ANDAMENTO, equipe, StatusObra.CONCLUIDA);
        tx.obraGesseiro.findMany.mockResolvedValue(equipe);

        const resultado = await service.concluir('obra-1');

        expect(tx.obra.updateMany).toHaveBeenCalledWith({
          where: { id: 'obra-1', status: { in: [StatusObra.ANDAMENTO] } },
          data: { dataConclusao: AGORA, status: StatusObra.CONCLUIDA },
        });
        expect(tx.obraGesseiro.findMany).toHaveBeenCalledWith({ where: { obraId: 'obra-1' } });
        expect(tx.lancamento.createMany).toHaveBeenCalledWith({
          data: [
            {
              gesseiroId: 'g-1',
              obraId: 'obra-1',
              tipo: TipoLancamento.CREDITO,
              valor: 2500,
              descricao: 'Credito automatico pela conclusao da obra "Forro Residencia Silva"',
            },
            {
              gesseiroId: 'g-2',
              obraId: 'obra-1',
              tipo: TipoLancamento.CREDITO,
              valor: 1500,
              descricao: 'Credito automatico pela conclusao da obra "Forro Residencia Silva"',
            },
          ],
        });
        // A equipe e lida depois da troca de status, dentro da transacao.
        expect(tx.obra.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
          tx.obraGesseiro.findMany.mock.invocationCallOrder[0],
        );
        expect(prisma.lancamento.createMany).not.toHaveBeenCalled();
        expect(resultado).toEqual({ id: 'obra-1', status: StatusObra.CONCLUIDA });
      });

      it.each([
        StatusObra.ORCAMENTO,
        StatusObra.FECHADA,
        StatusObra.CONCLUIDA,
        StatusObra.CANCELADA,
      ])('a partir de %s: 400 com a mensagem exata, sem update e sem credito', async (status) => {
        prepararObra(status, equipe);

        const promessa = service.concluir('obra-1');

        await expect(promessa).rejects.toBeInstanceOf(BadRequestException);
        await expect(promessa).rejects.toThrow(
          `Não é possível concluir uma obra com status ${status}`,
        );
        expect(tx.obra.updateMany).not.toHaveBeenCalled();
        naoTocouLancamentos();
      });

      it('nao credita duas vezes se a obra ja estiver concluida', async () => {
        prepararObra(StatusObra.CONCLUIDA);

        await expect(service.concluir('obra-1')).rejects.toThrow(
          'Não é possível concluir uma obra com status CONCLUIDA',
        );
        naoTocouLancamentos();
      });

      it('corrida: updateMany com count 0 rele o status e responde 400, sem credito', async () => {
        tx.obra.findUnique
          .mockResolvedValueOnce(obraEm(StatusObra.ANDAMENTO, equipe))
          .mockResolvedValueOnce({ status: StatusObra.CONCLUIDA });
        tx.obra.updateMany.mockResolvedValue({ count: 0 });
        tx.obraGesseiro.findMany.mockResolvedValue(equipe);

        const promessa = service.concluir('obra-1');

        await expect(promessa).rejects.toBeInstanceOf(BadRequestException);
        await expect(promessa).rejects.toThrow(
          'Não é possível concluir uma obra com status CONCLUIDA',
        );
        expect(tx.obra.findUnique).toHaveBeenLastCalledWith({
          where: { id: 'obra-1' },
          select: { status: true },
        });
        naoTocouLancamentos();
      });

      it('corrida em que a obra foi apagada no meio: 404', async () => {
        tx.obra.findUnique
          .mockResolvedValueOnce(obraEm(StatusObra.ANDAMENTO, equipe))
          .mockResolvedValueOnce(null);
        tx.obra.updateMany.mockResolvedValue({ count: 0 });

        await expect(service.concluir('obra-1')).rejects.toThrow('Obra obra-1 nao encontrada');
        naoTocouLancamentos();
      });

      it('falha ao criar os creditos propaga o erro pela transacao (rollback)', async () => {
        prepararObra(StatusObra.ANDAMENTO, equipe);
        tx.obraGesseiro.findMany.mockResolvedValue(equipe);
        const erro = new Error('falha no banco');
        tx.lancamento.createMany.mockRejectedValue(erro);

        await expect(service.concluir('obra-1')).rejects.toBe(erro);
        // Tudo aconteceu dentro do callback da $transaction: o erro desfaz a troca de status.
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(tx.obra.findUniqueOrThrow).not.toHaveBeenCalled();
      });

      it('ANDAMENTO sem equipe (todos removidos depois de iniciar): conclui sem lancamento', async () => {
        prepararObra(StatusObra.ANDAMENTO, [], StatusObra.CONCLUIDA);
        tx.obraGesseiro.findMany.mockResolvedValue([]);

        const resultado = await service.concluir('obra-1');

        expect(tx.obra.updateMany).toHaveBeenCalledTimes(1);
        naoTocouLancamentos();
        expect(resultado).toEqual({ id: 'obra-1', status: StatusObra.CONCLUIDA });
      });

      it('obra inexistente: 404 com a mensagem atual', async () => {
        tx.obra.findUnique.mockResolvedValue(null);

        const promessa = service.concluir('nao-existe');

        await expect(promessa).rejects.toBeInstanceOf(NotFoundException);
        await expect(promessa).rejects.toThrow('Obra nao-existe nao encontrada');
        expect(tx.obra.updateMany).not.toHaveBeenCalled();
      });
    });

    describe('fechar (TRN-01)', () => {
      it('ORCAMENTO: updateMany condicional para FECHADA e devolve a obra atualizada', async () => {
        prepararObra(StatusObra.ORCAMENTO, [], StatusObra.FECHADA);

        const resultado = await service.fechar('obra-1');

        expect(tx.obra.updateMany).toHaveBeenCalledWith({
          where: { id: 'obra-1', status: { in: [StatusObra.ORCAMENTO] } },
          data: { status: StatusObra.FECHADA },
        });
        // A leitura inicial traz a equipe: o iniciar e o concluir dependem dela.
        expect(tx.obra.findUnique).toHaveBeenNthCalledWith(1, {
          where: { id: 'obra-1' },
          include: { gesseiros: true },
        });
        expect(tx.obra.findUniqueOrThrow).toHaveBeenCalledWith({
          where: { id: 'obra-1' },
          include: { pagamento: true, gesseiros: { include: { gesseiro: true } } },
        });
        expect(resultado).toEqual({ id: 'obra-1', status: StatusObra.FECHADA });
      });

      it.each([
        StatusObra.FECHADA,
        StatusObra.ANDAMENTO,
        StatusObra.CONCLUIDA,
        StatusObra.CANCELADA,
      ])('a partir de %s: 400 com a mensagem exata, sem update', async (status) => {
        prepararObra(status);

        await expect(service.fechar('obra-1')).rejects.toThrow(
          `Não é possível fechar uma obra com status ${status}`,
        );
        expect(tx.obra.updateMany).not.toHaveBeenCalled();
      });

      it('obra inexistente: 404', async () => {
        tx.obra.findUnique.mockResolvedValue(null);

        await expect(service.fechar('nao-existe')).rejects.toThrow(
          'Obra nao-existe nao encontrada',
        );
      });
    });

    describe('iniciar (TRN-02)', () => {
      it('FECHADA com 1 gesseiro: ANDAMENTO com dataInicio igual ao instante da chamada', async () => {
        prepararObra(StatusObra.FECHADA, [equipe[0]], StatusObra.ANDAMENTO);

        const resultado = await service.iniciar('obra-1');

        expect(tx.obra.updateMany).toHaveBeenCalledWith({
          where: { id: 'obra-1', status: { in: [StatusObra.FECHADA] } },
          data: { dataInicio: AGORA, status: StatusObra.ANDAMENTO },
        });
        expect(resultado).toEqual({ id: 'obra-1', status: StatusObra.ANDAMENTO });
        naoTocouLancamentos();
      });

      it('FECHADA sem gesseiro: 400 com a mensagem exata, sem update', async () => {
        prepararObra(StatusObra.FECHADA, []);

        const promessa = service.iniciar('obra-1');

        await expect(promessa).rejects.toBeInstanceOf(BadRequestException);
        await expect(promessa).rejects.toThrow(
          'A obra precisa de pelo menos um gesseiro alocado para ser iniciada',
        );
        expect(tx.obra.updateMany).not.toHaveBeenCalled();
      });

      it('ORCAMENTO sem gesseiro: a origem e checada antes da equipe', async () => {
        prepararObra(StatusObra.ORCAMENTO, []);

        await expect(service.iniciar('obra-1')).rejects.toThrow(
          'Não é possível iniciar uma obra com status ORCAMENTO',
        );
        expect(tx.obra.updateMany).not.toHaveBeenCalled();
      });

      it.each([StatusObra.ANDAMENTO, StatusObra.CONCLUIDA, StatusObra.CANCELADA])(
        'a partir de %s: 400 com a mensagem exata',
        async (status) => {
          prepararObra(status, [equipe[0]]);

          await expect(service.iniciar('obra-1')).rejects.toThrow(
            `Não é possível iniciar uma obra com status ${status}`,
          );
          expect(tx.obra.updateMany).not.toHaveBeenCalled();
        },
      );
    });

    describe('cancelar (TRN-09)', () => {
      it.each([StatusObra.ORCAMENTO, StatusObra.FECHADA, StatusObra.ANDAMENTO])(
        'a partir de %s: CANCELADA com o motivo gravado e nenhum lancamento',
        async (status) => {
          prepararObra(status, equipe, StatusObra.CANCELADA);

          const resultado = await service.cancelar('obra-1', 'Cliente desistiu');

          expect(tx.obra.updateMany).toHaveBeenCalledWith({
            where: {
              id: 'obra-1',
              status: { in: [StatusObra.ORCAMENTO, StatusObra.FECHADA, StatusObra.ANDAMENTO] },
            },
            data: { motivoCancelamento: 'Cliente desistiu', status: StatusObra.CANCELADA },
          });
          naoTocouLancamentos();
          expect(resultado).toEqual({ id: 'obra-1', status: StatusObra.CANCELADA });
        },
      );

      it.each([StatusObra.CONCLUIDA, StatusObra.CANCELADA])(
        'a partir de %s: 400 com a mensagem exata',
        async (status) => {
          prepararObra(status);

          await expect(service.cancelar('obra-1', 'Cliente desistiu')).rejects.toThrow(
            `Não é possível cancelar uma obra com status ${status}`,
          );
          expect(tx.obra.updateMany).not.toHaveBeenCalled();
          naoTocouLancamentos();
        },
      );
    });
  });

  describe('removerGesseiro (TRN-08, TRN-12)', () => {
    const alocacao = { obraId: 'obra-1', gesseiroId: 'g-1', valorCombinado: 2500 };

    it.each([StatusObra.ORCAMENTO, StatusObra.FECHADA, StatusObra.ANDAMENTO])(
      'remove a alocacao em obra %s',
      async (status) => {
        prisma.obra.findUnique.mockResolvedValue({ id: 'obra-1', status });
        prisma.obraGesseiro.findUnique.mockResolvedValue(alocacao);

        const resultado = await service.removerGesseiro('obra-1', 'g-1');

        expect(prisma.obraGesseiro.delete).toHaveBeenCalledWith({
          where: { obraId_gesseiroId: { obraId: 'obra-1', gesseiroId: 'g-1' } },
        });
        expect(resultado).toEqual({ removido: true, obraId: 'obra-1', gesseiroId: 'g-1' });
      },
    );

    it('remove o ultimo gesseiro de uma obra ANDAMENTO (decisao do usuario)', async () => {
      prisma.obra.findUnique.mockResolvedValue({
        id: 'obra-1',
        status: StatusObra.ANDAMENTO,
        gesseiros: [alocacao],
      });
      prisma.obraGesseiro.findUnique.mockResolvedValue(alocacao);

      await service.removerGesseiro('obra-1', 'g-1');

      expect(prisma.obraGesseiro.delete).toHaveBeenCalledTimes(1);
    });

    it('falha no delete propaga o erro (a remocao espera o banco)', async () => {
      prisma.obra.findUnique.mockResolvedValue({ id: 'obra-1', status: StatusObra.FECHADA });
      prisma.obraGesseiro.findUnique.mockResolvedValue(alocacao);
      const erro = new Error('falha no banco');
      prisma.obraGesseiro.delete.mockRejectedValue(erro);

      await expect(service.removerGesseiro('obra-1', 'g-1')).rejects.toBe(erro);
    });

    it('gesseiro nao alocado: 404 com a mensagem exata, sem delete', async () => {
      prisma.obra.findUnique.mockResolvedValue({ id: 'obra-1', status: StatusObra.FECHADA });
      prisma.obraGesseiro.findUnique.mockResolvedValue(null);

      const promessa = service.removerGesseiro('obra-1', 'g-9');

      await expect(promessa).rejects.toBeInstanceOf(NotFoundException);
      await expect(promessa).rejects.toThrow('Gesseiro g-9 não está alocado nesta obra');
      expect(prisma.obraGesseiro.findUnique).toHaveBeenCalledWith({
        where: { obraId_gesseiroId: { obraId: 'obra-1', gesseiroId: 'g-9' } },
      });
      expect(prisma.obraGesseiro.delete).not.toHaveBeenCalled();
    });

    it('obra inexistente: 404 Obra <id> nao encontrada, sem delete', async () => {
      prisma.obra.findUnique.mockResolvedValue(null);

      await expect(service.removerGesseiro('nao-existe', 'g-1')).rejects.toThrow(
        'Obra nao-existe nao encontrada',
      );
      expect(prisma.obraGesseiro.delete).not.toHaveBeenCalled();
    });
  });

  /**
   * pwa-instalavel-responsivo (IDP-02, atomicidade): com o `tx` da transacao de idempotencia,
   * a validacao dos previstos e a criacao da obra usam o `tx`, nunca o `prisma` do service.
   */
  describe('create com tx externo', () => {
    it('passa o tx para validarItens e grava a obra pelo tx, sem tocar no prisma', async () => {
      const tx = {
        material: { findMany: jest.fn().mockResolvedValue([{ id: 'mat-cal' }]) },
        obra: { create: jest.fn().mockResolvedValue({ id: 'obra-nova' }) },
      };
      const materiaisPrevistos = (
        service as unknown as { materiaisPrevistos: MateriaisPrevistosService }
      ).materiaisPrevistos;
      const validarItens = jest.spyOn(materiaisPrevistos, 'validarItens');
      const itens = [{ materialId: 'mat-cal', quantidade: 20 }];

      const resultado = await service.create(
        { titulo: 'Forro', clienteNome: 'Cliente', valorTotal: 1000, materiaisPrevistos: itens },
        tx as never,
      );

      expect(validarItens).toHaveBeenCalledWith(itens, tx);
      expect(tx.material.findMany).toHaveBeenCalledTimes(1);
      expect(tx.obra.create).toHaveBeenCalledTimes(1);
      expect(tx.obra.create.mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          titulo: 'Forro',
          materiaisPrevistos: { create: [{ materialId: 'mat-cal', quantidade: 20 }] },
        }),
      );
      expect(resultado).toEqual({ id: 'obra-nova' });
      expect(prisma.material.findMany).not.toHaveBeenCalled();
      expect(prisma.obra.create).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
