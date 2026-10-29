import { numero, situacaoAlerta } from '../lib/formato';
import type { AlertaEstoque } from '../types';

/**
 * Um alerta ATIVO do agente de estoque.
 * Os números vêm dos campos gravados no alerta, nunca do texto da justificativa (EAP-27).
 */
interface Props {
  alerta: AlertaEstoque;
  /** true enquanto uma ação deste card está em andamento. */
  ocupado: boolean;
  onDispensar: () => void;
  onResolver: () => void;
}

export default function CardAlertaEstoque({ alerta, ocupado, onDispensar, onResolver }: Props) {
  const reposicao = alerta.tipo === 'REPOSICAO';
  const { nome, unidade } = alerta.material;

  return (
    <li className="card card-alerta" data-tipo={alerta.tipo}>
      <div className="card-topo">
        <h4>
          <span className="icone-alerta" role="img" aria-label={reposicao ? 'reposição' : 'observação'}>
            {reposicao ? '⚠️' : 'ℹ️'}
          </span>{' '}
          {nome}
        </h4>
        {alerta.origemTexto === 'PADRAO' && (
          <span className="badge badge-neutro">sem agente — alerta básico</span>
        )}
      </div>

      {reposicao && alerta.quantidadeSugerida !== null ? (
        <p className="quantidade-sugerida">
          Repor <strong data-testid="quantidade-sugerida">{numero(alerta.quantidadeSugerida)}</strong>{' '}
          <span data-testid="unidade">{unidade}</span>
        </p>
      ) : (
        // INFORMATIVO: o próprio rótulo é a situação ("observação do agente"), sem repetir a linha.
        <p className="rotulo-informativo">{situacaoAlerta(alerta)}</p>
      )}

      {reposicao && (
        <p className="situacao-alerta" data-testid="situacao">
          {situacaoAlerta(alerta)}
        </p>
      )}
      <p className="secundario" data-testid="saldo-livre">
        Saldo livre {numero(alerta.saldoLivre)} {unidade} · mínimo {numero(alerta.estoqueMinimo)}
      </p>
      <p className="justificativa">{alerta.justificativa}</p>

      <div className="card-acoes">
        <button type="button" className="btn" disabled={ocupado} onClick={onResolver}>
          Resolver
        </button>
        <button type="button" className="btn btn-secundario" disabled={ocupado} onClick={onDispensar}>
          Dispensar
        </button>
      </div>
    </li>
  );
}
