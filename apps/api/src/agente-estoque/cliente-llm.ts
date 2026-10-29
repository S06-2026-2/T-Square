import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Token de injecao da ClienteLlm (nos testes, trocada por um roteiro). */
export const CLIENTE_LLM = Symbol('CLIENTE_LLM');

export const MODELO_PADRAO = 'claude-haiku-5-5';
// O Haiku 5.5 pensa por padrao e o raciocinio conta no max_tokens; com 4096 a resposta
// pode parar em max_tokens, o que vira FALHA na analise.
export const MAX_TOKENS = 16000;

export interface RequisicaoLlm {
  system: string;
  tools: Anthropic.Tool[];
  messages: Anthropic.MessageParam[];
  signal: AbortSignal;
}

/**
 * Interface pequena sobre a Claude API, para o loop do agente nao depender do SDK.
 * Spec: .claude/specs/features/estoque-agente-proativo/spec.md (EAP-08)
 */
export interface ClienteLlm {
  disponivel(): boolean;
  enviar(req: RequisicaoLlm): Promise<Anthropic.Message>;
}

@Injectable()
export class AnthropicClienteLlm implements ClienteLlm {
  private cliente?: Anthropic;

  constructor(private readonly config: ConfigService) {}

  disponivel(): boolean {
    return this.chave() !== '';
  }

  async enviar(req: RequisicaoLlm): Promise<Anthropic.Message> {
    const apiKey = this.chave();
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY não configurada');
    }
    this.cliente ??= new Anthropic({ apiKey });

    return this.cliente.messages.create(
      {
        model: this.config.get<string>('ANTHROPIC_MODEL') || MODELO_PADRAO,
        max_tokens: MAX_TOKENS,
        system: req.system,
        tools: req.tools,
        messages: req.messages,
      },
      { signal: req.signal },
    );
  }

  private chave(): string {
    return (this.config.get<string>('ANTHROPIC_API_KEY') ?? '').trim();
  }
}
