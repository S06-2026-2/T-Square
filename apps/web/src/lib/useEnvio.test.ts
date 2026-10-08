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
