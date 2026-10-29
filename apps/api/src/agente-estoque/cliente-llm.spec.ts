import Anthropic from '@anthropic-ai/sdk';
import { ConfigService } from '@nestjs/config';

import { AnthropicClienteLlm } from './cliente-llm';

// O SDK e substituido por um mock: nenhum teste faz chamada de rede.
const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ messages: { create: mockCreate } })),
}));

/**
 * Cobre EAP-08 (sem chave) de .claude/specs/features/estoque-agente-proativo/spec.md
 */
describe('AnthropicClienteLlm', () => {
  const AnthropicMock = Anthropic as unknown as jest.Mock;

  const config = (valores: Record<string, string | undefined>) =>
    ({ get: (chave: string) => valores[chave] }) as unknown as ConfigService;

  const requisicao = (signal = new AbortController().signal) => ({
    system: 'sistema',
    tools: [] as Anthropic.Tool[],
    messages: [{ role: 'user' as const, content: 'oi' }],
    signal,
  });

  beforeEach(() => {
    AnthropicMock.mockClear();
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({ id: 'msg-1', stop_reason: 'end_turn', content: [] });
  });

  describe('sem ANTHROPIC_API_KEY', () => {
    it.each([undefined, '', '   '])('chave %p: disponivel() = false', (chave) => {
      const cliente = new AnthropicClienteLlm(config({ ANTHROPIC_API_KEY: chave }));

      expect(cliente.disponivel()).toBe(false);
    });

    it('enviar rejeita sem construir o cliente do SDK', async () => {
      const cliente = new AnthropicClienteLlm(config({}));

      await expect(cliente.enviar(requisicao())).rejects.toThrow('ANTHROPIC_API_KEY');
      expect(AnthropicMock).not.toHaveBeenCalled();
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('com ANTHROPIC_API_KEY', () => {
    it('disponivel() = true e usa o modelo de ANTHROPIC_MODEL', async () => {
      const cliente = new AnthropicClienteLlm(
        config({ ANTHROPIC_API_KEY: 'sk-teste', ANTHROPIC_MODEL: 'claude-opus-5-5' }),
      );

      expect(cliente.disponivel()).toBe(true);
      await cliente.enviar(requisicao());

      expect(AnthropicMock).toHaveBeenCalledWith({ apiKey: 'sk-teste' });
      expect(mockCreate.mock.calls[0][0].model).toBe('claude-opus-5-5');
    });

    it.each([undefined, ''])('ANTHROPIC_MODEL %p: usa claude-haiku-5-5', async (modelo) => {
      const cliente = new AnthropicClienteLlm(
        config({ ANTHROPIC_API_KEY: 'sk-teste', ANTHROPIC_MODEL: modelo }),
      );

      await cliente.enviar(requisicao());

      expect(mockCreate.mock.calls[0][0].model).toBe('claude-haiku-5-5');
    });

    it('repassa system, tools, messages e o signal da requisicao', async () => {
      const cliente = new AnthropicClienteLlm(config({ ANTHROPIC_API_KEY: 'sk-teste' }));
      const controle = new AbortController();
      const req = requisicao(controle.signal);

      const resposta = await cliente.enviar(req);

      const [corpo, opcoes] = mockCreate.mock.calls[0];
      expect(corpo).toEqual(
        expect.objectContaining({ system: 'sistema', tools: [], messages: req.messages }),
      );
      expect(opcoes.signal).toBe(controle.signal);
      expect(resposta).toEqual({ id: 'msg-1', stop_reason: 'end_turn', content: [] });
    });
  });
});
