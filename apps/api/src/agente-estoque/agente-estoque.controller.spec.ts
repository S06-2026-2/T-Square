import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { OrigemAnaliseEstoque } from '@prisma/client';

import { AgenteEstoqueController } from './agente-estoque.controller';
import { AgenteEstoqueService } from './agente-estoque.service';
import { AlertasEstoqueService } from './alertas-estoque.service';

/**
 * Cobre as rotas de EAP-21, 26, 46, 47 e 74 de .claude/specs/features/estoque-agente-proativo/spec.md
 * Os services sao mocks: o controller so repassa a chamada com o argumento certo.
 */
describe('AgenteEstoqueController', () => {
  let controller: AgenteEstoqueController;
  let agente: { analisar: jest.Mock };
  let alertas: {
    listarAtivos: jest.Mock;
    listarSilenciados: jest.Mock;
    dispensar: jest.Mock;
    resolver: jest.Mock;
  };

  beforeEach(async () => {
    agente = { analisar: jest.fn(async () => ({ id: 'an-1' })) };
    alertas = {
      listarAtivos: jest.fn(async () => ({ ultimaAnalise: null, alertas: [] })),
      listarSilenciados: jest.fn(async () => []),
      dispensar: jest.fn(async (id: string) => ({ id, status: 'DISPENSADO' })),
      resolver: jest.fn(async (id: string) => ({ id, status: 'RESOLVIDO' })),
    };
    const modulo: TestingModule = await Test.createTestingModule({
      controllers: [AgenteEstoqueController],
      providers: [
        { provide: AgenteEstoqueService, useValue: agente },
        { provide: AlertasEstoqueService, useValue: alertas },
      ],
    }).compile();
    controller = modulo.get(AgenteEstoqueController);
  });

  it.each([
    ['analisar', RequestMethod.POST, 'analisar'],
    ['alertas', RequestMethod.GET, 'alertas'],
    ['silenciados', RequestMethod.GET, 'silenciados'],
    ['dispensar', RequestMethod.PATCH, 'alertas/:id/dispensar'],
    ['resolver', RequestMethod.PATCH, 'alertas/:id/resolver'],
  ] as const)('%s responde em %s estoque/agente/%s', (metodo, verbo, caminho) => {
    const handler = AgenteEstoqueController.prototype[metodo];

    expect(Reflect.getMetadata(PATH_METADATA, AgenteEstoqueController)).toBe('estoque/agente');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(verbo);
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(caminho);
  });

  it('POST analisar roda a analise com origem MANUAL e devolve o resultado (EAP-21)', async () => {
    await expect(controller.analisar()).resolves.toEqual({ id: 'an-1' });

    expect(agente.analisar).toHaveBeenCalledTimes(1);
    expect(agente.analisar).toHaveBeenCalledWith(OrigemAnaliseEstoque.MANUAL);
  });

  it('GET alertas devolve listarAtivos (EAP-26)', async () => {
    await expect(controller.alertas()).resolves.toEqual({ ultimaAnalise: null, alertas: [] });

    expect(alertas.listarAtivos).toHaveBeenCalledWith();
  });

  it('GET silenciados devolve listarSilenciados (EAP-74)', async () => {
    await expect(controller.silenciados()).resolves.toEqual([]);

    expect(alertas.listarSilenciados).toHaveBeenCalledWith();
  });

  it('PATCH dispensar repassa o id da rota (EAP-46)', async () => {
    await expect(controller.dispensar('al-1')).resolves.toEqual({
      id: 'al-1',
      status: 'DISPENSADO',
    });

    expect(alertas.dispensar).toHaveBeenCalledWith('al-1');
    expect(alertas.resolver).not.toHaveBeenCalled();
  });

  it('PATCH resolver repassa o id da rota (EAP-47)', async () => {
    await expect(controller.resolver('al-2')).resolves.toEqual({ id: 'al-2', status: 'RESOLVIDO' });

    expect(alertas.resolver).toHaveBeenCalledWith('al-2');
    expect(alertas.dispensar).not.toHaveBeenCalled();
  });
});
