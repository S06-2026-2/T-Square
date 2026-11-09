/**
 * Cenários de chave de idempotência comuns aos 5 formulários de criação (IDP-01, IDP-07, IDP-08,
 * OFF-08). Só para testes: o nome não casa com `*.test.tsx`, então o Jest não o roda sozinho.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';

export const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const MENSAGEM_REDE =
  'Sem conexão: não foi possível confirmar o envio. Tente de novo; o mesmo lançamento não será duplicado.';
const MENSAGEM_422 =
  'O envio anterior pode ter sido gravado com outros dados. Confira a lista antes de enviar de novo.';
const MENSAGEM_409 =
  'Este envio ainda está sendo processado. Aguarde alguns segundos e tente de novo.';

/** Erro com o formato do `ApiError` (mensagem + status + codigo); o mock de `lib/api` não tem a classe. */
export function erroApi(mensagem: string, status: number, codigo?: string) {
  return Object.assign(new Error(mensagem), { status, codigo });
}

/** `idempotencyKey` do i-ésimo `api.post`. */
export function chaveDoEnvio(post: jest.Mock, i: number): string {
  return post.mock.calls[i][2].idempotencyKey;
}

interface Formulario {
  post: jest.Mock;
  /** Texto do botão de envio. */
  botao: string;
  renderizar: () => void;
  /** Preenche os campos obrigatórios. */
  preencher: () => void;
  /** Confere que os campos preenchidos continuam lá depois de uma falha. */
  conferirCampos: () => void;
}

export function testarChaveDeIdempotencia(form: Formulario) {
  const { post } = form;

  function enviar() {
    fireEvent.click(screen.getByRole('button', { name: form.botao }));
  }

  async function esperarEnvios(n: number) {
    await waitFor(() => expect(post).toHaveBeenCalledTimes(n));
    await waitFor(() => expect(screen.getByRole('button', { name: form.botao })).toBeEnabled());
  }

  describe('chave de idempotência (IDP-01)', () => {
    it('falha de rede: mensagem do OFF-08, campos mantidos e o reenvio leva a mesma chave', async () => {
      post.mockRejectedValueOnce(erroApi(MENSAGEM_REDE, 0)).mockResolvedValueOnce({ id: 'x' });
      form.renderizar();

      form.preencher();
      enviar();
      expect(await screen.findByText(MENSAGEM_REDE)).toHaveClass('erro');
      form.conferirCampos();
      await esperarEnvios(1);
      expect(chaveDoEnvio(post, 0)).toMatch(UUID_V4);

      enviar();
      await esperarEnvios(2);
      expect(chaveDoEnvio(post, 1)).toBe(chaveDoEnvio(post, 0));
    });

    it('409: mensagem do IDP-08 e o reenvio leva a mesma chave', async () => {
      post.mockRejectedValueOnce(erroApi('Este envio ainda está sendo processado.', 409, 'EM_PROCESSAMENTO')).mockResolvedValueOnce({ id: 'x' });
      form.renderizar();

      form.preencher();
      enviar();
      expect(await screen.findByText(MENSAGEM_409)).toHaveClass('erro');
      form.conferirCampos();
      await esperarEnvios(1);

      enviar();
      await esperarEnvios(2);
      expect(chaveDoEnvio(post, 1)).toBe(chaveDoEnvio(post, 0));
    });

    it('400: mensagem da API e o reenvio leva a mesma chave', async () => {
      post.mockRejectedValueOnce(erroApi('campo invalido', 400)).mockResolvedValueOnce({ id: 'x' });
      form.renderizar();

      form.preencher();
      enviar();
      expect(await screen.findByText('campo invalido')).toHaveClass('erro');
      await esperarEnvios(1);

      enviar();
      await esperarEnvios(2);
      expect(chaveDoEnvio(post, 1)).toBe(chaveDoEnvio(post, 0));
    });

    it('422: mensagem do IDP-07, campos mantidos e o próximo envio leva outra chave', async () => {
      post.mockRejectedValueOnce(erroApi('Idempotency-Key reutilizada', 422)).mockResolvedValueOnce({ id: 'x' });
      form.renderizar();

      form.preencher();
      enviar();
      expect(await screen.findByText(MENSAGEM_422)).toHaveClass('erro');
      form.conferirCampos();
      await esperarEnvios(1);

      enviar();
      await esperarEnvios(2);
      expect(chaveDoEnvio(post, 1)).toMatch(UUID_V4);
      expect(chaveDoEnvio(post, 1)).not.toBe(chaveDoEnvio(post, 0));
    });

    it('sucesso: o próximo envio leva outra chave', async () => {
      post.mockResolvedValue({ id: 'x' });
      form.renderizar();

      form.preencher();
      enviar();
      await esperarEnvios(1);

      form.preencher();
      enviar();
      await esperarEnvios(2);
      expect(chaveDoEnvio(post, 1)).toMatch(UUID_V4);
      expect(chaveDoEnvio(post, 1)).not.toBe(chaveDoEnvio(post, 0));
    });
  });
}
