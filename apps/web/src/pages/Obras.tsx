import { useEffect, useState } from 'react';

import AlocarGesseiroForm from '../components/forms/AlocarGesseiroForm';
import MateriaisPrevistosForm from '../components/forms/MateriaisPrevistosForm';
import NovaObraForm from '../components/forms/NovaObraForm';
import Icone from '../components/Icone';
import StatusBadge from '../components/StatusBadge';
import { api } from '../lib/api';
import { moeda } from '../lib/formato';
import { STATUS_FUNIL, rotuloPlural } from '../lib/status';
import type { Gesseiro, Obra, StatusObra } from '../types';

/** Obra concluida ja gerou os creditos; alocar depois nunca credita o gesseiro (AD-005). */
const aceitaAlocacao: StatusObra[] = ['ORCAMENTO', 'FECHADA', 'ANDAMENTO'];

const filtros: Array<{ valor: StatusObra | 'TODAS'; rotulo: string }> = [
  { valor: 'TODAS', rotulo: 'Todas' },
  ...STATUS_FUNIL.filter((status) => status !== 'CANCELADA').map((status) => ({
    valor: status,
    rotulo: rotuloPlural[status],
  })),
];

export default function Obras() {
  const [obras, setObras] = useState<Obra[]>([]);
  const [filtro, setFiltro] = useState<StatusObra | 'TODAS'>('TODAS');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [gesseiros, setGesseiros] = useState<Gesseiro[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  /** Obras com "Materiais previstos" aberto: o formulário só monta (e busca na API) quando abre. */
  const [previstosAbertos, setPrevistosAbertos] = useState<Record<string, boolean>>({});

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

  useEffect(() => {
    api
      .get<Gesseiro[]>('/gesseiros')
      .then(setGesseiros)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao carregar gesseiros'));
  }, []);

  async function obraCriada() {
    setMostrarForm(false);
    // A obra nova nasce ORCAMENTO; com outro filtro ativo ela sumiria da lista.
    // Se o filtro ja e TODAS, o useEffect nao dispara de novo, entao recarrega direto.
    if (filtro === 'TODAS') {
      await carregar();
    } else {
      setFiltro('TODAS');
    }
  }

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
        <div>
          <h1>Obras</h1>
          <p className="subtitulo-pagina">Acompanhe o funil, do orcamento a conclusao.</p>
        </div>
        <button
          type="button"
          className={mostrarForm ? 'btn btn-secundario' : 'btn'}
          onClick={() => setMostrarForm((aberto) => !aberto)}
        >
          {!mostrarForm && <Icone nome="mais" />}
          {mostrarForm ? 'Fechar' : 'Nova obra'}
        </button>
      </div>

      {mostrarForm && <NovaObraForm gesseiros={gesseiros} onSalvo={obraCriada} />}

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
      {carregando && <p className="carregando">Carregando...</p>}

      <div className="grade">
        {obras.map((obra) => (
          <article key={obra.id} className="card card-obra" data-status={obra.status}>
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
              <div className="card-acoes">
                <button
                  type="button"
                  className="btn btn-secundario"
                  onClick={() => concluir(obra.id)}
                >
                  Concluir obra
                </button>
              </div>
            )}

            {aceitaAlocacao.includes(obra.status) && (
              <details>
                <summary>Alocar gesseiro</summary>
                <AlocarGesseiroForm obraId={obra.id} gesseiros={gesseiros} onSalvo={carregar} />
              </details>
            )}

            {/* Em todo card: a tabela previsto x utilizado sempre; a edição só nos status
                editáveis, decidida pelo próprio formulário (EAP-43, EAP-44). */}
            <details
              onToggle={(e) => {
                const aberto = (e.currentTarget as HTMLDetailsElement).open;
                setPrevistosAbertos((atual) => ({ ...atual, [obra.id]: aberto }));
              }}
            >
              <summary>Materiais previstos</summary>
              {previstosAbertos[obra.id] && (
                <MateriaisPrevistosForm obraId={obra.id} status={obra.status} />
              )}
            </details>
          </article>
        ))}
      </div>

      {!carregando && obras.length === 0 && (
        <div className="estado-vazio">
          <Icone nome="vazio" tamanho={28} />
          <p>Nenhuma obra neste filtro.</p>
        </div>
      )}
    </section>
  );
}
