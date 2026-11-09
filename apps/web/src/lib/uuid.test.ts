import { gerarUuid } from './uuid';

/** Mesma regex da API (`apps/api/src/idempotencia/contexto-idempotencia.decorator.ts`, `UUID`). */
const UUID_DA_API = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

function trocarCrypto(valor: unknown) {
  Object.defineProperty(globalThis, 'crypto', { value: valor, configurable: true, writable: true });
}

afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'crypto', original);
});

function mil() {
  return Array.from({ length: 1000 }, () => gerarUuid());
}

describe('gerarUuid', () => {
  it('usa crypto.randomUUID quando existe', () => {
    const randomUUID = jest.fn(() => '0b6e4c1e-3c2f-4d6a-9f1e-2a7b8c9d0e1f');
    const getRandomValues = jest.fn();
    trocarCrypto({ randomUUID, getRandomValues });

    expect(gerarUuid()).toBe('0b6e4c1e-3c2f-4d6a-9f1e-2a7b8c9d0e1f');
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(getRandomValues).not.toHaveBeenCalled();
  });

  describe('sem randomUUID (contexto inseguro), com getRandomValues', () => {
    it('gera 1000 UUID v4 válidos para a API e sem repetição', () => {
      const getRandomValues = jest.fn((bytes: Uint8Array) => {
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
        return bytes;
      });
      trocarCrypto({ getRandomValues });

      const chaves = mil();

      expect(getRandomValues).toHaveBeenCalledTimes(1000);
      chaves.forEach((chave) => {
        expect(chave).toMatch(UUID_V4);
        expect(chave).toMatch(UUID_DA_API);
      });
      expect(new Set(chaves).size).toBe(1000);
    });

    it('força versão 4 e variante 10xx mesmo com bytes todos 1 ou todos 0', () => {
      trocarCrypto({ getRandomValues: (bytes: Uint8Array) => bytes.fill(0xff) });
      expect(gerarUuid()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');

      trocarCrypto({ getRandomValues: (bytes: Uint8Array) => bytes.fill(0x00) });
      expect(gerarUuid()).toBe('00000000-0000-4000-8000-000000000000');
    });
  });

  it('sem Web Crypto nenhuma, ainda gera 1000 UUID v4 válidos e sem repetição (Math.random)', () => {
    trocarCrypto(undefined);

    const chaves = mil();

    chaves.forEach((chave) => {
      expect(chave).toMatch(UUID_V4);
      expect(chave).toMatch(UUID_DA_API);
    });
    expect(new Set(chaves).size).toBe(1000);
  });
});
