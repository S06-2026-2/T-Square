import { useEffect, useState } from 'react';

import Icone from '../components/Icone';
import { api } from '../lib/api';
import { iniciais, moeda } from '../lib/formato';
import type { Extrato, Gesseiro } from '../types';

export default function Gesseiros() {
  const [gesseiros, setGesseiros] = useState<Gesseiro[]>([]);
  const [extrato, setExtrato] = useState<Extrato | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Gesseiro[]>('/gesseiros')
      .then(setGesseiros)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao carregar gesseiros'));
  }, []);

  async function abrirExtrato(id: string) {
    setErro(null);
    try {
      setExtrato(await api.get<Extrato>(`/gesseiros/${id}/extrato`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar extrato');
    }
  }

  return (
    <section>
      <div className="cabecalho-pagina">
        <div>
          <h1>Gesseiros</h1>
          <p className="subtitulo-pagina">Equipe, vales, pagamentos e saldo a receber de cada um.</p>
        </div>
        {/* TODO(equipe): botao "Novo gesseiro" e formulario de vale/pagamento */}
      </div>

      {erro && <p className="erro">{erro}</p>}

      <div className="duas-colunas">
        <ul className="lista lista-pessoas">
          {gesseiros.map((gesseiro) => (
            <li
              key={gesseiro.id}
              className={extrato?.gesseiro.id === gesseiro.id ? 'selecionado' : undefined}
            >
              <span className="avatar">{iniciais(gesseiro.nome)}</span>
              <span className="pessoa">
                <button type="button" className="btn-texto" onClick={() => abrirExtrato(gesseiro.id)}>
                  {gesseiro.nome}
                </button>
                <span className="secundario">{gesseiro.telefone ?? 'sem telefone'}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="card">
          {!extrato && (
            <div className="estado-vazio">
              <Icone nome="gesseiros" tamanho={28} />
              <p>Selecione um gesseiro para ver vale, haver e saldo.</p>
            </div>
          )}

          {extrato && (
            <>
              <h2>{extrato.gesseiro.nome}</h2>

              <dl className="resumo">
                <div>
                  <dt>Creditos (obras concluidas)</dt>
                  <dd>{moeda(extrato.creditos)}</dd>
                </div>
                <div>
                  <dt>Vales</dt>
                  <dd>{moeda(extrato.vales)}</dd>
                </div>
                <div>
                  <dt>Ja pago</dt>
                  <dd>{moeda(extrato.pagamentos)}</dd>
                </div>
                <div className="destaque">
                  <dt>Saldo a receber</dt>
                  <dd>{moeda(extrato.saldoAReceber)}</dd>
                </div>
              </dl>

              <h3>Lancamentos</h3>
              <ul className="lista">
                {extrato.lancamentos.map((lancamento) => (
                  <li key={lancamento.id}>
                    <span className={`badge badge-${lancamento.tipo.toLowerCase()}`}>
                      {lancamento.tipo}
                    </span>
                    <span>{moeda(lancamento.valor)}</span>
                    <span className="secundario">
                      {lancamento.obra?.titulo ?? lancamento.descricao ?? ''}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
