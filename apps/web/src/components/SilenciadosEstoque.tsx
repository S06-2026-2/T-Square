import { useState } from 'react';

import { api } from '../lib/api';
import { dataHora } from '../lib/formato';
import type { SilenciadoEstoque } from '../types';
import Icone from './Icone';

const rotuloAcao: Record<`${SilenciadoEstoque['tipo']}-${SilenciadoEstoque['acao']}`, string> = {
  'REPOSICAO-DISPENSADO': 'Reposição dispensada',
  'REPOSICAO-RESOLVIDO': 'Reposição resolvida',
  'INFORMATIVO-DISPENSADO': 'Observação dispensada',
  'INFORMATIVO-RESOLVIDO': 'Observação resolvida',
};

/**
 * Símbolo ao lado dos alertas: abre e fecha a lista do que o agente não vai alertar porque o
 * operador dispensou ou resolveu o último alerta. Busca a lista a cada vez que abre, para
 * refletir na hora um Dispensar/Resolver feito na seção.
 */
export default function SilenciadosEstoque() {
  const [aberto, setAberto] = useState(false);
  const [silenciados, setSilenciados] = useState<SilenciadoEstoque[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function alternar() {
    if (aberto) {
      setAberto(false);
      return;
    }
    setAberto(true);
    setErro(null);
    try {
      setSilenciados(await api.get<SilenciadoEstoque[]>('/estoque/agente/silenciados'));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar os silenciados');
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-secundario btn-icone"
        aria-label={aberto ? 'Fechar silenciados' : 'Ver silenciados'}
        title="Silenciados pelo operador"
        aria-expanded={aberto}
        aria-controls="painel-silenciados"
        onClick={() => void alternar()}
      >
        <Icone nome="silenciado" />
      </button>

      {aberto && (
        <div id="painel-silenciados" className="painel-silenciados" role="region" aria-label="Silenciados pelo operador">
          <h4>Silenciados pelo operador</h4>
          {erro && <p className="erro">{erro}</p>}
          {!erro && silenciados === null && <p className="carregando">Carregando...</p>}
          {!erro && silenciados?.length === 0 && (
            <p className="subtitulo-pagina">Nenhum material silenciado.</p>
          )}
          {!erro && silenciados && silenciados.length > 0 && (
            <ul>
              {silenciados.map((s) => (
                <li key={s.alertaId}>
                  <div className="linha-silenciado">
                    <strong>{s.material.nome}</strong>
                    <span className="badge badge-neutro">{rotuloAcao[`${s.tipo}-${s.acao}`]}</span>
                  </div>
                  <p>
                    Em {dataHora(s.em)} · volta a ser analisado em {dataHora(s.ate)}
                  </p>
                  {s.abrangencia === 'INFORMATIVO' && (
                    <p>Só observações ficam de fora; a reposição continua sendo alertada.</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
