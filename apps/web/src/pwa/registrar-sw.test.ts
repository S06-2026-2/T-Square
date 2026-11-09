import { registrarSw } from './registrar-sw';

type SwFalso = {
  register: jest.Mock;
  addEventListener: jest.Mock;
};

function instalarSw(register = jest.fn().mockResolvedValue({})): SwFalso {
  const sw: SwFalso = { register, addEventListener: jest.fn() };
  Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true });
  return sw;
}

function removerSw() {
  // `delete` volta ao jsdom original, que não tem serviceWorker.
  delete (navigator as unknown as Record<string, unknown>).serviceWorker;
}

describe('registrarSw (PWA-03, PWA-04, UPD-03)', () => {
  afterEach(() => {
    removerSw();
    jest.restoreAllMocks();
  });

  it('no build de produção registra /sw.js com escopo "/" (PWA-03)', async () => {
    const sw = instalarSw();

    await registrarSw({ prod: true });

    expect(sw.register).toHaveBeenCalledTimes(1);
    expect(sw.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });

  it('no dev (prod: false) não registra nada (PWA-04)', async () => {
    const sw = instalarSw();

    await registrarSw({ prod: false });

    expect(sw.register).not.toHaveBeenCalled();
  });

  it('navegador sem service worker: não registra e não lança erro', async () => {
    removerSw();
    expect('serviceWorker' in navigator).toBe(false);

    await expect(registrarSw({ prod: true })).resolves.toBeUndefined();
  });

  it('falha no register não derruba o app', async () => {
    instalarSw(jest.fn().mockRejectedValue(new Error('SecurityError')));

    await expect(registrarSw({ prod: true })).resolves.toBeUndefined();
  });

  it('não escuta controllerchange e não recarrega a página (UPD-03)', async () => {
    const sw = instalarSw();
    const reload = jest.fn();
    const addEventListenerJanela = jest.spyOn(window, 'addEventListener');
    const localOriginal = window.location;
    Object.defineProperty(window, 'location', {
      value: { ...localOriginal, reload },
      configurable: true,
    });

    try {
      await registrarSw({ prod: true });
    } finally {
      Object.defineProperty(window, 'location', { value: localOriginal, configurable: true });
    }

    expect(sw.addEventListener).not.toHaveBeenCalled();
    expect(addEventListenerJanela).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
