import { act, renderHook } from '@testing-library/react';

import {
  assinar,
  estaDesatualizado,
  registrarOrigem,
  useAoReconectar,
  useDesatualizado,
} from './conexao';

/** Simula o navegador ficando offline/online: muda `navigator.onLine` e dispara o evento. */
function ficar(estado: 'online' | 'offline') {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => estado === 'online',
  });
  window.dispatchEvent(new Event(estado));
}

beforeEach(() => {
  ficar('online');
  registrarOrigem('rede');
});

afterAll(() => {
  delete (navigator as { onLine?: boolean }).onLine;
});

describe('estaDesatualizado (OFF-06, OFF-07)', () => {
  it('online e última resposta da rede: não está desatualizado', () => {
    expect(estaDesatualizado()).toBe(false);
  });

  it('navegador offline: está desatualizado, mesmo com a última resposta da rede', () => {
    ficar('offline');
    expect(estaDesatualizado()).toBe(true);
  });

  it('última resposta GET veio do cache: está desatualizado, mesmo online', () => {
    registrarOrigem('cache');
    expect(estaDesatualizado()).toBe(true);
  });

  it('volta a falso com uma resposta da rede e o navegador online', () => {
    ficar('offline');
    registrarOrigem('cache');

    registrarOrigem('rede');
    expect(estaDesatualizado()).toBe(true);
    ficar('online');
    expect(estaDesatualizado()).toBe(false);
  });
});

describe('assinar', () => {
  it('avisa em registrarOrigem, online e offline; o retorno cancela', () => {
    const fn = jest.fn();
    const cancelar = assinar(fn);

    registrarOrigem('cache');
    expect(fn).toHaveBeenCalledTimes(1);
    ficar('offline');
    expect(fn).toHaveBeenCalledTimes(2);
    ficar('online');
    expect(fn).toHaveBeenCalledTimes(3);

    cancelar();
    registrarOrigem('rede');
    ficar('offline');
    ficar('online');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('useDesatualizado', () => {
  it('re-renderiza quando a origem ou a conexão mudam', () => {
    const { result } = renderHook(() => useDesatualizado());
    expect(result.current).toBe(false);

    act(() => registrarOrigem('cache'));
    expect(result.current).toBe(true);

    act(() => registrarOrigem('rede'));
    expect(result.current).toBe(false);

    act(() => ficar('offline'));
    expect(result.current).toBe(true);

    act(() => ficar('online'));
    expect(result.current).toBe(false);
  });
});

describe('useAoReconectar (OFF-15)', () => {
  it('chama fn uma vez por evento online e nunca no offline', () => {
    const fn = jest.fn();
    renderHook(() => useAoReconectar(fn));

    act(() => ficar('offline'));
    expect(fn).not.toHaveBeenCalled();

    act(() => ficar('online'));
    expect(fn).toHaveBeenCalledTimes(1);

    act(() => ficar('offline'));
    act(() => ficar('online'));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('chama a versão mais recente de fn depois de um re-render', () => {
    const primeira = jest.fn();
    const segunda = jest.fn();
    const { rerender } = renderHook(({ fn }) => useAoReconectar(fn), {
      initialProps: { fn: primeira },
    });

    rerender({ fn: segunda });
    act(() => ficar('online'));

    expect(primeira).not.toHaveBeenCalled();
    expect(segunda).toHaveBeenCalledTimes(1);
  });

  it('remove o listener ao desmontar', () => {
    const remover = jest.spyOn(window, 'removeEventListener');
    const fn = jest.fn();
    const { unmount } = renderHook(() => useAoReconectar(fn));

    unmount();
    act(() => ficar('online'));

    expect(fn).not.toHaveBeenCalled();
    expect(remover).toHaveBeenCalledWith('online', expect.any(Function));
    remover.mockRestore();
  });
});
