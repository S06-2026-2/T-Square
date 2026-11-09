import { BadRequestException, ExecutionContext } from '@nestjs/common';

import { extrairContexto } from './contexto-idempotencia.decorator';
import { hashCorpo } from './hash-corpo';

/**
 * IDP-02 (escopo por usuario e rota) e IDP-06 (sem cabecalho) de
 * .claude/specs/features/pwa-instalavel-responsivo/spec.md, e a validacao de UUID do design.
 */
describe('extrairContexto (@ContextoIdempotencia)', () => {
  const CHAVE = '3f2b8c1e-9a4d-4e6f-b1c2-7d8e9f0a1b2c';

  function contexto(req: {
    headers?: Record<string, string>;
    method?: string;
    path?: string;
    body?: unknown;
  }) {
    const headers = Object.fromEntries(
      Object.entries(req.headers ?? {}).map(([nome, valor]) => [nome.toLowerCase(), valor]),
    );
    const request = {
      method: req.method ?? 'POST',
      path: req.path ?? '/api/gesseiros/g-1/lancamentos',
      body: req.body,
      user: { id: 'usuario-1', email: 'admin@gesso.com', papel: 'ADMIN' },
      header: (nome: string) => headers[nome.toLowerCase()],
    };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  it('sem Idempotency-Key devolve null (IDP-06)', () => {
    expect(extrairContexto(contexto({ body: { valor: 1 } }))).toBeNull();
  });

  it('cabecalho que nao e UUID da 400 com a mensagem exata', () => {
    const ctx = contexto({ headers: { 'Idempotency-Key': 'abc-123' } });

    expect(() => extrairContexto(ctx)).toThrow(BadRequestException);
    expect(() => extrairContexto(ctx)).toThrow('Idempotency-Key deve ser um UUID.');
  });

  it('monta chave, usuario do JWT, rota com o path real e o hash do corpo', () => {
    const body = { tipo: 'VALE', valor: 150 };

    const resultado = extrairContexto(
      contexto({
        headers: { 'Idempotency-Key': CHAVE },
        method: 'POST',
        path: '/api/gesseiros/g-1/lancamentos',
        body,
      }),
    );

    expect(resultado).toEqual({
      chave: CHAVE,
      usuarioId: 'usuario-1',
      rota: 'POST /api/gesseiros/g-1/lancamentos',
      hashCorpo: hashCorpo(body),
    });
  });

  it('a mesma chave em outro recurso vira outra rota (path real, sem query string)', () => {
    const headers = { 'Idempotency-Key': CHAVE };

    const a = extrairContexto(contexto({ headers, path: '/api/gesseiros/A/lancamentos' }));
    const b = extrairContexto(contexto({ headers, path: '/api/gesseiros/B/lancamentos' }));

    expect(a?.rota).toBe('POST /api/gesseiros/A/lancamentos');
    expect(b?.rota).toBe('POST /api/gesseiros/B/lancamentos');
  });
});
