import { act, renderHook } from '@testing-library/react';

import { useEnvio } from './useEnvio';

describe('useEnvio', () => {
  it('fica enviando enquanto a requisicao nao termina e devolve true no sucesso', async () => {
    const { result } = renderHook(() => useEnvio());
    let terminar!: () => void;
    const pendente = new Promise<void>((resolve) => {
      terminar = resolve;
    });

    let envio!: Promise<boolean>;
    act(() => {
      envio = result.current.enviar(() => pendente);
    });
    expect(result.current.enviando).toBe(true);

    let ok!: boolean;
    await act(async () => {
      terminar();
      ok = await envio;
    });

    expect(ok).toBe(true);
    expect(result.current.enviando).toBe(false);
    expect(result.current.erro).toBeNull();
  });

  it('guarda a mensagem do erro da API e devolve false', async () => {
    const { result } = renderHook(() => useEnvio());

    let ok!: boolean;
    await act(async () => {
      ok = await result.current.enviar(async () => {
        throw new Error('titulo must be longer than or equal to 3 characters');
      });
    });

    expect(ok).toBe(false);
    expect(result.current.erro).toBe('titulo must be longer than or equal to 3 characters');
    expect(result.current.enviando).toBe(false);
  });

  it('usa mensagem padrao quando o erro nao e um Error', async () => {
    const { result } = renderHook(() => useEnvio());

    await act(async () => {
      await result.current.enviar(() => Promise.reject('falha'));
    });

    expect(result.current.erro).toBe('Erro ao salvar');
  });

  it('limpa o erro anterior quando um novo envio da certo', async () => {
    const { result } = renderHook(() => useEnvio());

    await act(async () => {
      await result.current.enviar(() => Promise.reject(new Error('falhou')));
    });
    await act(async () => {
      await result.current.enviar(() => Promise.resolve());
    });

    expect(result.current.erro).toBeNull();
  });
});

// Chaves previsíveis (chave-1, chave-2, ...) para saber quando o hook gera uma nova.
jest.mock('./uuid', () => ({ gerarUuid: jest.fn() }));

const MENSAGEM_422 =
  'O envio anterior pode ter sido gravado com outros dados. Confira a lista antes de enviar de novo.';
const MENSAGEM_409 =
  'Este envio ainda está sendo processado. Aguarde alguns segundos e tente de novo.';
const MENSAGEM_REDE =
  'Sem conexão: não foi possível confirmar o envio. Tente de novo; o mesmo lançamento não será duplicado.';

/** Erro com o mesmo formato do `ApiError` do `api.ts` (mensagem + status + codigo). */
function erroApi(mensagem: string, status: number, codigo?: string) {
  return Object.assign(new Error(mensagem), { status, codigo });
}

describe('useEnvio: chave de idempotência (IDP-01, IDP-07, IDP-08, OFF-08)', () => {
  const { gerarUuid } = jest.requireMock('./uuid') as { gerarUuid: jest.Mock };

  beforeEach(() => {
    let n = 0;
    gerarUuid.mockReset();
    gerarUuid.mockImplementation(() => `chave-${++n}`);
  });

  async function enviarCom(
    result: { current: ReturnType<typeof useEnvio> },
    fn: (chave: string) => Promise<void>,
  ) {
    let ok!: boolean;
    await act(async () => {
      ok = await result.current.enviar(fn);
    });
    return ok;
  }

  it('cria uma chave só na montagem, estável entre renders, e a passa para fn', async () => {
    const { result, rerender } = renderHook(() => useEnvio());
    expect(result.current.chave).toBe('chave-1');
    expect(gerarUuid).toHaveBeenCalledTimes(1);

    rerender();
    expect(result.current.chave).toBe('chave-1');

    const fn = jest.fn(async () => {
      throw erroApi('Saldo insuficiente', 400);
    });
    await enviarCom(result, fn);
    expect(fn).toHaveBeenCalledWith('chave-1');
  });

  it('sucesso: devolve true e troca a chave', async () => {
    const { result } = renderHook(() => useEnvio());
    const usadas: string[] = [];

    expect(await enviarCom(result, async (chave) => void usadas.push(chave))).toBe(true);
    expect(result.current.chave).toBe('chave-2');
    await enviarCom(result, async (chave) => void usadas.push(chave));

    expect(usadas).toEqual(['chave-1', 'chave-2']);
  });

  it('422: devolve false, mostra a mensagem do IDP-07 e troca a chave', async () => {
    const { result } = renderHook(() => useEnvio());

    const ok = await enviarCom(result, async () => {
      throw erroApi('Idempotency-Key reutilizada com outro corpo', 422);
    });

    expect(ok).toBe(false);
    expect(result.current.erro).toBe(MENSAGEM_422);
    expect(result.current.chave).toBe('chave-2');
  });

  it('409: devolve false, mostra a mensagem do IDP-08 e mantém a chave', async () => {
    const { result } = renderHook(() => useEnvio());

    const ok = await enviarCom(result, async () => {
      throw erroApi('Este envio ainda está sendo processado.', 409, 'EM_PROCESSAMENTO');
    });

    expect(ok).toBe(false);
    expect(result.current.erro).toBe(MENSAGEM_409);
    expect(result.current.chave).toBe('chave-1');
  });

  it('falha de rede (status 0): devolve false, mostra a mensagem do api.ts e mantém a chave', async () => {
    const { result } = renderHook(() => useEnvio());

    const ok = await enviarCom(result, async () => {
      throw erroApi(MENSAGEM_REDE, 0);
    });

    expect(ok).toBe(false);
    expect(result.current.erro).toBe(MENSAGEM_REDE);
    expect(result.current.chave).toBe('chave-1');
  });

  it.each([
    ['400', erroApi('valor must not be less than 0', 400), 'valor must not be less than 0'],
    // 409 de negócio (não é o da idempotência): mensagem da API, como hoje (FRM-08 AC3).
    ['409 de negócio', erroApi('Ja existe um material chamado "Placa"', 409), 'Ja existe um material chamado "Placa"'],
    // Mesmo texto da API, mas sem o código: a decisão é pelo `codigo`, nunca pelo texto.
    ['409 com o texto da idempotência e sem código', erroApi('Este envio ainda está sendo processado.', 409), 'Este envio ainda está sendo processado.'],
    ['409 com outro código', erroApi('Conflito', 409, 'OUTRO'), 'Conflito'],
    ['500', erroApi('Erro ao comunicar com a API', 500), 'Erro ao comunicar com a API'],
    ['Error sem status', new Error('falhou'), 'falhou'],
  ])('outro erro (%s): mensagem como hoje e mesma chave', async (_caso, erro, mensagem) => {
    const { result } = renderHook(() => useEnvio());

    expect(await enviarCom(result, () => Promise.reject(erro))).toBe(false);

    expect(result.current.erro).toBe(mensagem);
    expect(result.current.chave).toBe('chave-1');
  });

  describe('troca de recurso com o hook montado', () => {
    it('outro recurso troca a chave; o mesmo recurso mantém; a montagem gera uma só', () => {
      const { result, rerender } = renderHook(({ recurso }) => useEnvio(recurso), {
        initialProps: { recurso: 'g-ana' },
      });
      expect(result.current.chave).toBe('chave-1');
      expect(gerarUuid).toHaveBeenCalledTimes(1);

      rerender({ recurso: 'g-ana' });
      expect(result.current.chave).toBe('chave-1');

      rerender({ recurso: 'g-beto' });
      expect(result.current.chave).toBe('chave-2');

      rerender({ recurso: 'g-beto' });
      expect(result.current.chave).toBe('chave-2');
    });

    it('depois de uma falha de rede no recurso A, o envio para B nunca reusa a chave de A', async () => {
      const { result, rerender } = renderHook(({ recurso }) => useEnvio(recurso), {
        initialProps: { recurso: 'g-ana' },
      });
      const usadas: string[] = [];

      await enviarCom(result, async (chave) => {
        usadas.push(chave);
        throw erroApi(MENSAGEM_REDE, 0);
      });
      expect(result.current.chave).toBe('chave-1');

      rerender({ recurso: 'g-beto' });
      await enviarCom(result, async (chave) => void usadas.push(chave));

      expect(usadas).toHaveLength(2);
      expect(usadas[1]).not.toBe(usadas[0]);
    });
  });
});
