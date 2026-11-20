import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { LimpezaService, PRAZO_ARQUIVO_MS } from './limpeza.service';

/** ARQ-13 e ARQ-15 (restaurar durante a limpeza) de arquivar-e-limpar-registros. */
describe('LimpezaService', () => {
  const AGORA = new Date('2026-11-20T06:00:00.000Z');
  const LIMITE = new Date(AGORA.getTime() - PRAZO_ARQUIVO_MS);
  const ARQUIVADA_EM = new Date('2026-11-10T12:00:00.000Z');
  let service: LimpezaService;

  /** Cliente da transação, separado do prisma (AD-012). */
  let tx: {
    obra: { updateMany: jest.Mock; delete: jest.Mock };
    gesseiro: { updateMany: jest.Mock; delete: jest.Mock };
    material: { updateMany: jest.Mock; delete: jest.Mock };
    lancamento: { updateMany: jest.Mock };
    movimentacaoEstoque: { updateMany: jest.Mock };
    obraGesseiro: { deleteMany: jest.Mock };
    materialPrevistoObra: { deleteMany: jest.Mock };
  };
  let prisma: {
    obra: { findMany: jest.Mock; delete: jest.Mock };
    gesseiro: { findMany: jest.Mock; delete: jest.Mock };
    material: { findMany: jest.Mock; delete: jest.Mock };
    $transaction: jest.Mock;
  };

  const vencido = (id: string) => ({ id, arquivadoEm: ARQUIVADA_EM });
  const travado = { count: 1 };

  beforeEach(async () => {
    tx = {
      obra: { updateMany: jest.fn().mockResolvedValue(travado), delete: jest.fn() },
      gesseiro: { updateMany: jest.fn().mockResolvedValue(travado), delete: jest.fn() },
      material: { updateMany: jest.fn().mockResolvedValue(travado), delete: jest.fn() },
      lancamento: { updateMany: jest.fn() },
      movimentacaoEstoque: { updateMany: jest.fn() },
      obraGesseiro: { deleteMany: jest.fn() },
      materialPrevistoObra: { deleteMany: jest.fn() },
    };
    prisma = {
      obra: { findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
      gesseiro: { findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
      material: { findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
      $transaction: jest.fn((callback: (t: unknown) => unknown) => callback(tx)),
    };
    const modulo: TestingModule = await Test.createTestingModule({
      providers: [LimpezaService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = modulo.get(LimpezaService);
  });

  it('o prazo é de 7 dias', () => {
    expect(PRAZO_ARQUIVO_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('busca as 3 entidades com arquivadoEm <= agora − 7 dias', async () => {
    await service.limpar(AGORA);

    const filtro = {
      where: { arquivadoEm: { lte: LIMITE } },
      select: { id: true, arquivadoEm: true },
    };
    expect(prisma.obra.findMany).toHaveBeenCalledWith(filtro);
    expect(prisma.gesseiro.findMany).toHaveBeenCalledWith(filtro);
    expect(prisma.material.findMany).toHaveBeenCalledWith(filtro);
    expect(LIMITE.toISOString()).toBe('2026-11-13T06:00:00.000Z');
  });

  it('obra: trava, solta lançamentos e movimentações e só depois apaga, tudo no tx', async () => {
    prisma.obra.findMany.mockResolvedValue([vencido('o-1')]);

    const resultado = await service.limpar(AGORA);

    expect(tx.obra.updateMany).toHaveBeenCalledWith({
      where: { id: 'o-1', arquivadoEm: { lte: LIMITE } },
      data: { arquivadoEm: ARQUIVADA_EM },
    });
    expect(tx.lancamento.updateMany).toHaveBeenCalledWith({
      where: { obraId: 'o-1' },
      data: { obraId: null },
    });
    expect(tx.movimentacaoEstoque.updateMany).toHaveBeenCalledWith({
      where: { obraId: 'o-1' },
      data: { obraId: null },
    });
    expect(tx.obra.delete).toHaveBeenCalledWith({ where: { id: 'o-1' } });
    const ordem = (m: jest.Mock) => m.mock.invocationCallOrder[0];
    expect(ordem(tx.obra.updateMany)).toBeLessThan(ordem(tx.lancamento.updateMany));
    expect(ordem(tx.lancamento.updateMany)).toBeLessThan(ordem(tx.obra.delete));
    expect(ordem(tx.movimentacaoEstoque.updateMany)).toBeLessThan(ordem(tx.obra.delete));
    expect(prisma.obra.delete).not.toHaveBeenCalled();
    expect(resultado).toEqual({ obras: 1, gesseiros: 0, materiais: 0, falhas: [] });
  });

  it('gesseiro: apaga as alocações antes do gesseiro', async () => {
    prisma.gesseiro.findMany.mockResolvedValue([vencido('g-1')]);

    const resultado = await service.limpar(AGORA);

    expect(tx.obraGesseiro.deleteMany).toHaveBeenCalledWith({ where: { gesseiroId: 'g-1' } });
    expect(tx.gesseiro.delete).toHaveBeenCalledWith({ where: { id: 'g-1' } });
    expect(tx.obraGesseiro.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.gesseiro.delete.mock.invocationCallOrder[0],
    );
    expect(resultado.gesseiros).toBe(1);
  });

  it('material: apaga os previstos antes do material', async () => {
    prisma.material.findMany.mockResolvedValue([vencido('m-1')]);

    const resultado = await service.limpar(AGORA);

    expect(tx.materialPrevistoObra.deleteMany).toHaveBeenCalledWith({
      where: { materialId: 'm-1' },
    });
    expect(tx.material.delete).toHaveBeenCalledWith({ where: { id: 'm-1' } });
    expect(tx.materialPrevistoObra.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.material.delete.mock.invocationCallOrder[0],
    );
    expect(resultado.materiais).toBe(1);
  });

  it('restaurado no meio (a trava pega 0 linhas): não apaga nada nem conta', async () => {
    prisma.obra.findMany.mockResolvedValue([vencido('o-1')]);
    prisma.gesseiro.findMany.mockResolvedValue([vencido('g-1')]);
    prisma.material.findMany.mockResolvedValue([vencido('m-1')]);
    tx.obra.updateMany.mockResolvedValue({ count: 0 });
    tx.gesseiro.updateMany.mockResolvedValue({ count: 0 });
    tx.material.updateMany.mockResolvedValue({ count: 0 });

    const resultado = await service.limpar(AGORA);

    for (const metodo of [
      tx.lancamento.updateMany,
      tx.movimentacaoEstoque.updateMany,
      tx.obra.delete,
      tx.obraGesseiro.deleteMany,
      tx.gesseiro.delete,
      tx.materialPrevistoObra.deleteMany,
      tx.material.delete,
    ]) {
      expect(metodo).not.toHaveBeenCalled();
    }
    expect(resultado).toEqual({ obras: 0, gesseiros: 0, materiais: 0, falhas: [] });
  });

  // Auditor #5: cada entidade trava na própria tabela.
  it.each([
    ['obra', 'gesseiro', 'material'],
    ['gesseiro', 'obra', 'material'],
    ['material', 'obra', 'gesseiro'],
  ] as const)('só a trava de %s pega 0 linhas: só ela fica', async (restaurada, outra1, outra2) => {
    prisma.obra.findMany.mockResolvedValue([vencido('o-1')]);
    prisma.gesseiro.findMany.mockResolvedValue([vencido('g-1')]);
    prisma.material.findMany.mockResolvedValue([vencido('m-1')]);
    tx[restaurada].updateMany.mockResolvedValue({ count: 0 });

    await service.limpar(AGORA);

    expect(tx[restaurada].delete).not.toHaveBeenCalled();
    expect(tx[outra1].delete).toHaveBeenCalledTimes(1);
    expect(tx[outra2].delete).toHaveBeenCalledTimes(1);
    for (const entidade of ['obra', 'gesseiro', 'material'] as const) {
      expect(tx[entidade].updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: `${entidade[0]}-1`, arquivadoEm: { lte: LIMITE } },
        }),
      );
    }
  });

  it('uma transação por registro; a falha de um vai para o log e os outros seguem', async () => {
    prisma.obra.findMany.mockResolvedValue([vencido('o-1'), vencido('o-2')]);
    prisma.material.findMany.mockResolvedValue([vencido('m-1')]);
    tx.obra.delete.mockRejectedValueOnce(new Error('FK violada')).mockResolvedValueOnce({});
    const log = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

    const resultado = await service.limpar(AGORA);

    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(resultado).toEqual({
      obras: 1,
      gesseiros: 0,
      materiais: 1,
      falhas: [{ entidade: 'obra', id: 'o-1', erro: 'FK violada' }],
    });
    expect(log).toHaveBeenCalledWith('Falha ao apagar obra o-1: FK violada');
  });

  it('ordem: obras, depois gesseiros, depois materiais', async () => {
    prisma.obra.findMany.mockResolvedValue([vencido('o-1')]);
    prisma.gesseiro.findMany.mockResolvedValue([vencido('g-1')]);
    prisma.material.findMany.mockResolvedValue([vencido('m-1')]);

    await service.limpar(AGORA);

    const ordem = (m: jest.Mock) => m.mock.invocationCallOrder[0];
    expect(ordem(tx.obra.delete)).toBeLessThan(ordem(prisma.gesseiro.findMany));
    expect(ordem(tx.gesseiro.delete)).toBeLessThan(ordem(prisma.material.findMany));
  });

  it('a rodada agendada usa a hora atual e devolve o resultado', async () => {
    jest.useFakeTimers().setSystemTime(AGORA);
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);

    try {
      expect(await service.rodarAgendada()).toEqual({
        obras: 0,
        gesseiros: 0,
        materiais: 0,
        falhas: [],
      });
      expect(prisma.obra.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { arquivadoEm: { lte: LIMITE } } }),
      );
    } finally {
      jest.useRealTimers();
    }
  });
});
