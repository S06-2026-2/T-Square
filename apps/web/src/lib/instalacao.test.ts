import { act, renderHook } from '@testing-library/react';

import { iniciarCapturaInstalacao, useInstalacao } from './instalacao';

const UA = {
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipadSafari:
    'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  // iPad em modo "site para computador": igual ao Safari do Mac.
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
  iphoneFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15',
  iphoneEdge:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/130.0.2849.80 Mobile/15E148 Safari/605.1.15',
  firefoxDesktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
};

/** Simula o navegador: user agent, plataforma, pontos de toque, standalone e display-mode. */
function navegador({
  ua = UA.chromeAndroid,
  plataforma = 'Linux armv8l',
  toques = 5,
  standalone,
  displayStandalone = false,
}: {
  ua?: string;
  plataforma?: string;
  toques?: number;
  standalone?: boolean;
  displayStandalone?: boolean;
} = {}) {
  const definir = (alvo: object, nome: string, valor: unknown) =>
    Object.defineProperty(alvo, nome, { configurable: true, get: () => valor });
  definir(navigator, 'userAgent', ua);
  definir(navigator, 'platform', plataforma);
  definir(navigator, 'maxTouchPoints', toques);
  definir(navigator, 'standalone', standalone);
  window.matchMedia = jest.fn((consulta: string) => ({
    matches: consulta === '(display-mode: standalone)' && displayStandalone,
    media: consulta,
  })) as unknown as typeof window.matchMedia;
}

/** `beforeinstallprompt` simulado; o desfecho do diálogo é resolvido pelo teste. */
function convite() {
  let escolher!: (outcome: 'accepted' | 'dismissed') => void;
  const evento = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: jest.fn(async () => undefined),
    userChoice: new Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>((resolve) => {
      escolher = (outcome) => resolve({ outcome, platform: 'web' });
    }),
  });
  return { evento, escolher };
}

function disparar(evento: Event) {
  act(() => {
    window.dispatchEvent(evento);
  });
}

beforeAll(() => {
  iniciarCapturaInstalacao();
});

beforeEach(() => {
  navegador();
  // Zera o evento guardado entre os testes.
  disparar(new Event('appinstalled'));
});

afterAll(() => {
  for (const nome of ['userAgent', 'platform', 'maxTouchPoints', 'standalone']) {
    delete (navigator as unknown as Record<string, unknown>)[nome];
  }
});

describe('useInstalacao: convite do navegador (PWA-05, PWA-06, PWA-07)', () => {
  it('sem beforeinstallprompt, fora do iOS: modo null (PWA-09)', () => {
    const { result } = renderHook(() => useInstalacao());
    expect(result.current.modo).toBeNull();
  });

  it('beforeinstallprompt: chama preventDefault e o modo vira "prompt" (PWA-05)', () => {
    const { result } = renderHook(() => useInstalacao());
    const { evento } = convite();

    disparar(evento);

    expect(evento.defaultPrevented).toBe(true);
    expect(result.current.modo).toBe('prompt');
  });

  it.each(['accepted', 'dismissed'] as const)(
    'instalar() abre o diálogo, espera a escolha e, com "%s", o modo vira null; um novo convite volta a "prompt" (PWA-06, PWA-07)',
    async (outcome) => {
      const { result } = renderHook(() => useInstalacao());
      const { evento, escolher } = convite();
      disparar(evento);

      let instalando!: Promise<void>;
      act(() => {
        instalando = result.current.instalar();
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(evento.prompt).toHaveBeenCalledTimes(1);
      // Enquanto o operador não escolhe, o botão continua.
      expect(result.current.modo).toBe('prompt');

      await act(async () => {
        escolher(outcome);
        await instalando;
      });
      expect(result.current.modo).toBeNull();

      disparar(convite().evento);
      expect(result.current.modo).toBe('prompt');
    },
  );

  it('instalar() sem convite guardado não faz nada e não lança erro', async () => {
    const { result } = renderHook(() => useInstalacao());

    await expect(result.current.instalar()).resolves.toBeUndefined();
    expect(result.current.modo).toBeNull();
  });

  it('appinstalled: o modo vira null (PWA-07)', () => {
    const { result } = renderHook(() => useInstalacao());
    disparar(convite().evento);
    expect(result.current.modo).toBe('prompt');

    disparar(new Event('appinstalled'));

    expect(result.current.modo).toBeNull();
  });
});

describe('useInstalacao: já instalado (PWA-08)', () => {
  it('display-mode standalone: null, mesmo com beforeinstallprompt', () => {
    navegador({ displayStandalone: true });
    const { result } = renderHook(() => useInstalacao());

    disparar(convite().evento);

    expect(window.matchMedia).toHaveBeenCalledWith('(display-mode: standalone)');
    expect(result.current.modo).toBeNull();
  });

  it('navigator.standalone (iOS aberto da tela de início): null, mesmo com evento', () => {
    navegador({ ua: UA.iphoneSafari, plataforma: 'iPhone', standalone: true });
    const { result } = renderHook(() => useInstalacao());

    disparar(convite().evento);

    expect(result.current.modo).toBeNull();
  });
});

describe('useInstalacao: Safari do iOS (PWA-10) e navegadores sem convite (PWA-09)', () => {
  it.each([
    ['iPhone Safari', { ua: UA.iphoneSafari, plataforma: 'iPhone' }],
    ['iPad Safari', { ua: UA.ipadSafari, plataforma: 'iPad' }],
    ['iPad como Mac (MacIntel com toque)', { ua: UA.macSafari, plataforma: 'MacIntel', toques: 5 }],
  ])('%s fora do standalone: "ios"', (_nome, config) => {
    navegador(config);
    const { result } = renderHook(() => useInstalacao());
    expect(result.current.modo).toBe('ios');
  });

  it.each([
    ['Chrome no iPhone (CriOS)', { ua: UA.iphoneChrome, plataforma: 'iPhone' }],
    ['Firefox no iPhone (FxiOS)', { ua: UA.iphoneFirefox, plataforma: 'iPhone' }],
    ['Edge no iPhone (EdgiOS)', { ua: UA.iphoneEdge, plataforma: 'iPhone' }],
    ['Safari no Mac (MacIntel sem toque)', { ua: UA.macSafari, plataforma: 'MacIntel', toques: 0 }],
    ['Firefox desktop', { ua: UA.firefoxDesktop, plataforma: 'Win32', toques: 0 }],
  ])('%s sem beforeinstallprompt: null', (_nome, config) => {
    navegador(config);
    const { result } = renderHook(() => useInstalacao());
    expect(result.current.modo).toBeNull();
  });

  it('navegador sem matchMedia: não lança erro e segue as outras regras', () => {
    navegador({ ua: UA.iphoneSafari, plataforma: 'iPhone' });
    delete (window as { matchMedia?: unknown }).matchMedia;

    const { result } = renderHook(() => useInstalacao());

    expect(result.current.modo).toBe('ios');
  });
});
