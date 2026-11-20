import { useState } from 'react';

import { api } from '../lib/api';
import { ehFalhaDeRede, mensagemDe } from '../lib/arquivamento';
import { moeda } from '../lib/formato';
import type { Obra, SituacaoArquivamento } from '../types';

interface Props {
  obra: Obra;
  /** Arquivada (ou resposta HTTP de erro): a página recarrega com o filtro atual. */
  onAlterada: () => void | Promise<void>;
}

/**
 * ARQ-05: "Arquivar obra" em card CONCLUIDA. O painel mostra as duas confirmações que a API
 * também confere (gesseiros pagos e cliente quitado); "Arquivar" só habilita com as duas OK.
 * Erros seguem a AD-014: com resposta HTTP, mensagem e recarga; sem rede, só a mensagem.
 */
export default function ArquivarObra({ obra, onAlterada }: Props) {
  const [aberto, setAberto] = useState(false);
  const [situacao, setSituacao] = useState<SituacaoArquivamento | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Com o painel aberto ele fica, mesmo se a recarga trouxer a obra com outro status.
  if (obra.status !== 'CONCLUIDA' && !aberto) return null;

  async function abrir() {
    setAberto(true);
    setErro(null);
    setSituacao(null);
    try {
      setSituacao(await api.get<SituacaoArquivamento>(`/obras/${obra.id}/arquivamento`));
    } catch (e) {
      setErro(mensagemDe(e));
    }
  }

  function fechar() {
    setAberto(false);
    setSituacao(null);
    setErro(null);
  }

  async function arquivar() {
    setOcupado(true);
    setErro(null);
    try {
      await api.patch(`/obras/${obra.id}/arquivar`);
      setAberto(false);
      await onAlterada();
    } catch (e) {
      setErro(mensagemDe(e));
      if (!ehFalhaDeRede(e)) await onAlterada();
    } finally {
      setOcupado(false);
    }
  }

  if (!aberto) {
    return (
      <div className="card-acoes">
        <button type="button" className="btn btn-secundario" onClick={() => void abrir()}>
          Arquivar obra
        </button>
      </div>
    );
  }

  return (
    <div className="form-card painel-arquivar" role="group" aria-label="Arquivar obra">
      {situacao && (
        <ul className="confirmacoes">
          <li data-testid="gesseiros-pagos">
            <strong>Gesseiros pagos:</strong>{' '}
            {situacao.gesseirosPendentes.length === 0
              ? '✔'
              : situacao.gesseirosPendentes
                  .map((pendente) => `${pendente.nome} — ${moeda(pendente.saldo)}`)
                  .join(', ')}
          </li>
          <li data-testid="cliente-pagou">
            <strong>
              Cliente pagou {moeda(situacao.valorRecebido)} de {moeda(situacao.valorTotal)}
            </strong>{' '}
            {situacao.clienteQuitado ? '✔' : '✘'}
          </li>
        </ul>
      )}
      {!situacao && !erro && <p className="secundario">Conferindo pagamentos...</p>}
      {erro && <p className="erro">{erro}</p>}
      <p className="secundario">
        A obra arquivada é apagada de vez em 7 dias; até lá dá para restaurar.
      </p>
      <div className="card-acoes">
        <button
          type="button"
          className="btn"
          disabled={!situacao?.podeArquivar || ocupado}
          onClick={() => void arquivar()}
        >
          Arquivar
        </button>
        <button type="button" className="btn btn-secundario" onClick={fechar} disabled={ocupado}>
          Voltar
        </button>
      </div>
    </div>
  );
}
