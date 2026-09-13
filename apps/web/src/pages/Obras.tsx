import { useEffect, useState } from 'react';

import StatusBadge from '../components/StatusBadge';
import { api } from '../lib/api';
import { moeda } from '../lib/formato';
import type { Obra, StatusObra } from '../types';

const filtros: Array<{ valor: StatusObra | 'TODAS'; rotulo: string }> = [
  { valor: 'TODAS', rotulo: 'Todas' },
  { valor: 'ORCAMENTO', rotulo: 'Aguardando cliente' },
  { valor: 'FECHADA', rotulo: 'Fechadas' },
  { valor: 'ANDAMENTO', rotulo: 'Em andamento' },
  { valor: 'CONCLUIDA', rotulo: 'Concluidas' },
];

export default function Obras() {
  const [obras, setObras] = useState<Obra[]>([]);
  const [filtro, setFiltro] = useState<StatusObra | 'TODAS'>('TODAS');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      const query = filtro === 'TODAS' ? '' : `?status=${filtro}`;
      setObras(await api.get<Obra[]>(`/obras${query}`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar obras');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro]);

  async function concluir(id: string) {
    try {
      await api.patch(`/obras/${id}/concluir`);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao concluir obra');
    }
  }

  return (
    <section>
      <div className="cabecalho-pagina">
        <h1>Obras</h1>
        {/* TODO(equipe): botao "Nova obra" abrindo o formulario de cadastro */}
      </div>

      <div className="filtros">
        {filtros.map((opcao) => (
          <button
            key={opcao.valor}
            type="button"
            className={filtro === opcao.valor ? 'chip ativo' : 'chip'}
            onClick={() => setFiltro(opcao.valor)}
          >
            {opcao.rotulo}
          </button>
        ))}
      </div>

      {erro && <p className="erro">{erro}</p>}
      {carregando && <p>Carregando...</p>}

      <div className="grade">
        {obras.map((obra) => (
          <article key={obra.id} className="card">
            <header className="card-topo">
              <h2>{obra.titulo}</h2>
              <StatusBadge status={obra.status} />
            </header>

            <p className="cliente">
              {obra.clienteNome}
              {obra.clienteTelefone ? ` - ${obra.clienteTelefone}` : ''}
            </p>
            {obra.endereco && <p className="endereco">{obra.endereco}</p>}

            <p className="valor">{moeda(obra.valorTotal)}</p>

            {obra.pagamento && (
              <p className="pagamento">
                {obra.pagamento.forma.replace('_', ' ')} em {obra.pagamento.parcelas}x
                {Number(obra.pagamento.valorEntrada) > 0 &&
                  ` (entrada de ${moeda(obra.pagamento.valorEntrada)})`}
              </p>
            )}

            {obra.gesseiros && obra.gesseiros.length > 0 && (
              <ul className="lista-gesseiros">
                {obra.gesseiros.map((alocacao) => (
                  <li key={alocacao.id}>
                    {alocacao.gesseiro?.nome ?? alocacao.gesseiroId} -{' '}
                    {moeda(alocacao.valorCombinado)}
                  </li>
                ))}
              </ul>
            )}

            {obra.plantaBaixaUrl && (
              <a href={obra.plantaBaixaUrl} target="_blank" rel="noreferrer">
                Ver planta baixa
              </a>
            )}

            {obra.status !== 'CONCLUIDA' && obra.status !== 'CANCELADA' && (
              <button type="button" className="btn" onClick={() => concluir(obra.id)}>
                Concluir obra
              </button>
            )}
          </article>
        ))}
      </div>

      {!carregando && obras.length === 0 && <p>Nenhuma obra neste filtro.</p>}
    </section>
  );
}
