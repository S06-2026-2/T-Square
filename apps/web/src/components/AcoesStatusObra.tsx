import { FormEvent, useState } from 'react';

import { api } from '../lib/api';
import { acaoDeAvanco, textoConfirmacaoConclusao } from '../lib/status';
import type { Obra, StatusObra } from '../types';

interface Props {
  obra: Obra;
  /** Transição aplicada (ou resposta HTTP de erro): a página recarrega com o filtro atual. */
  onAlterada: () => void | Promise<void>;
  /**
   * Erro de fechar/iniciar/concluir. `recarregar` é true quando veio uma resposta HTTP de erro
   * (a lista recarrega para mostrar o status real) e false na falha de rede (AD-014).
   */
  onErro: (mensagem: string, recarregar: boolean) => void | Promise<void>;
}

const CANCELAVEIS: StatusObra[] = ['ORCAMENTO', 'FECHADA', 'ANDAMENTO'];

export const SEM_EQUIPE_PARA_INICIAR = 'Aloque pelo menos um gesseiro para iniciar';

/**
 * Falha de rede: o `lib/api.ts` lança ApiError com status 0 e a mensagem do OFF-08. Lê o
 * `status` sem `instanceof`, como o `useEnvio` (os testes mockam o módulo `api` inteiro).
 */
const ehFalhaDeRede = (e: unknown) => (e as { status?: unknown } | null)?.status === 0;
const mensagemDe = (e: unknown) => (e instanceof Error ? e.message : 'Erro ao comunicar com a API');

/**
 * Botões de status de um card de obra (obras-transicoes-status, TRN-05/10/11/13): o avanço do
 * status atual e o cancelamento com motivo. Nada é reenviado sozinho depois de uma falha.
 */
export default function AcoesStatusObra({ obra, onAlterada, onErro }: Props) {
  const [ocupado, setOcupado] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [erroCancelamento, setErroCancelamento] = useState<string | null>(null);

  const avanco = acaoDeAvanco[obra.status];
  const podeCancelar = CANCELAVEIS.includes(obra.status);
  const semEquipe = obra.status === 'FECHADA' && (obra.gesseiros?.length ?? 0) === 0;

  // Com o formulário aberto, ele fica na tela mesmo se a recarga depois de um erro trouxer a obra
  // já CONCLUIDA/CANCELADA (resposta perdida): a mensagem da API e o motivo não somem (P2 AC7).
  if (!avanco && !podeCancelar && !cancelando) {
    return null;
  }

  async function avancar() {
    if (!avanco) return;
    if (avanco.acao === 'concluir' && !window.confirm(textoConfirmacaoConclusao(obra))) {
      return;
    }
    setOcupado(true);
    try {
      await api.patch(`/obras/${obra.id}/${avanco.acao}`);
      await onAlterada();
    } catch (e) {
      await onErro(mensagemDe(e), !ehFalhaDeRede(e));
    } finally {
      setOcupado(false);
    }
  }

  async function cancelar(evento: FormEvent) {
    evento.preventDefault();
    setOcupado(true);
    setErroCancelamento(null);
    try {
      await api.patch(`/obras/${obra.id}/cancelar`, { motivo });
      setCancelando(false);
      setMotivo('');
      await onAlterada();
    } catch (e) {
      setErroCancelamento(mensagemDe(e));
      // Com resposta HTTP, a lista recarrega para mostrar o status real; sem rede, não.
      if (!ehFalhaDeRede(e)) {
        await onAlterada();
      }
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="acoes-status">
      <div className="card-acoes">
        {avanco && (
          <button
            type="button"
            className="btn"
            onClick={avancar}
            disabled={ocupado || (avanco.acao === 'iniciar' && semEquipe)}
          >
            {avanco.rotulo}
          </button>
        )}
        {podeCancelar && !cancelando && (
          <button
            type="button"
            className="btn btn-secundario"
            onClick={() => setCancelando(true)}
            disabled={ocupado}
          >
            Cancelar obra
          </button>
        )}
      </div>

      {avanco?.acao === 'iniciar' && semEquipe && (
        <p className="aviso-acao">{SEM_EQUIPE_PARA_INICIAR}</p>
      )}

      {cancelando && (
        <form className="form-card form-cancelamento" onSubmit={cancelar}>
          <label>
            Motivo
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              required
              minLength={3}
              maxLength={500}
              rows={3}
            />
          </label>
          {erroCancelamento && <p className="erro">{erroCancelamento}</p>}
          <div className="card-acoes">
            <button type="submit" className="btn" disabled={ocupado || !podeCancelar}>
              Confirmar cancelamento
            </button>
            <button
              type="button"
              className="btn btn-secundario"
              onClick={() => {
                setCancelando(false);
                setErroCancelamento(null);
              }}
              disabled={ocupado}
            >
              Voltar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
