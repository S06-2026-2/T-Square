import { useState } from 'react';

import { gerarUuid } from './uuid';

export const ENVIO_COM_OUTROS_DADOS =
  'O envio anterior pode ter sido gravado com outros dados. Confira a lista antes de enviar de novo.';
export const ENVIO_EM_PROCESSAMENTO =
  'Este envio ainda está sendo processado. Aguarde alguns segundos e tente de novo.';

/**
 * `codigo` do 409 de chave em processamento (`apps/api/src/idempotencia/idempotencia.service.ts`,
 * `CODIGO_EM_PROCESSAMENTO`). Só esse 409 vira a mensagem do IDP-08; um 409 de negócio (ex.:
 * material com nome duplicado) mostra a mensagem da API. A decisão é pelo código, nunca pelo texto.
 */
const CODIGO_EM_PROCESSAMENTO = 'EM_PROCESSAMENTO';

/**
 * Lê `status` e `codigo` do `ApiError` sem `instanceof`: os testes de formulário mockam
 * `lib/api` sem a classe.
 */
function statusDo(erro: unknown): number | undefined {
  const status = (erro as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
}

function codigoDo(erro: unknown): string | undefined {
  const codigo = (erro as { codigo?: unknown } | null)?.codigo;
  return typeof codigo === 'string' ? codigo : undefined;
}

/**
 * Estado de submit compartilhado pelos formularios.
 * Desabilita o botao durante o envio e guarda a mensagem de erro da API
 * sem mexer nos campos: quem chama so limpa o formulario quando recebe true.
 *
 * `chave` é a Idempotency-Key do próximo envio (IDP-01). Nasce na montagem e só muda depois de um
 * sucesso, de um 422 (IDP-07) ou quando `recurso` muda com o formulário aberto (outro gesseiro,
 * outro material). Falha de rede (status 0), 409 (IDP-08) e outros erros mantêm a chave, para o
 * reenvio manual não duplicar.
 */
export function useEnvio(recurso?: string) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [atual, setAtual] = useState(() => ({ recurso, chave: gerarUuid() }));

  // Ajuste de estado durante o render (padrão do React para derivar de props): a chave nova já
  // vale neste render, sem um render intermediário com a chave do recurso anterior.
  let chave = atual.chave;
  if (atual.recurso !== recurso) {
    chave = gerarUuid();
    setAtual({ recurso, chave });
  }

  function trocarChave() {
    setAtual((anterior) => ({ ...anterior, chave: gerarUuid() }));
  }

  async function enviar(fn: (chave: string) => Promise<void>): Promise<boolean> {
    setErro(null);
    setEnviando(true);
    try {
      await fn(chave);
      trocarChave();
      return true;
    } catch (e) {
      const status = statusDo(e);
      if (status === 422) {
        setErro(ENVIO_COM_OUTROS_DADOS);
        trocarChave();
      } else if (status === 409 && codigoDo(e) === CODIGO_EM_PROCESSAMENTO) {
        setErro(ENVIO_EM_PROCESSAMENTO);
      } else {
        setErro(e instanceof Error ? e.message : 'Erro ao salvar');
      }
      return false;
    } finally {
      setEnviando(false);
    }
  }

  return { enviando, erro, enviar, chave };
}
