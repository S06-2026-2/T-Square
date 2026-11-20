import { useEffect, useRef, useState } from 'react';

import LancamentoForm from '../components/forms/LancamentoForm';
import NovoGesseiroForm from '../components/forms/NovoGesseiroForm';
import Icone from '../components/Icone';
import ListaArquivados from '../components/ListaArquivados';
import { api } from '../lib/api';
import {
  ZERE_O_SALDO,
  confirmacaoArquivarGesseiro,
  ehFalhaDeRede,
  mensagemDe,
} from '../lib/arquivamento';
import { useAoReconectar } from '../lib/conexao';
import { iniciais, moeda } from '../lib/formato';
import type { Extrato, Gesseiro } from '../types';

export default function Gesseiros() {
  const [gesseiros, setGesseiros] = useState<Gesseiro[]>([]);
  const [extrato, setExtrato] = useState<Extrato | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  /** "Ver arquivados" aberto (ARQ-08). */
  const [verArquivados, setVerArquivados] = useState(false);
  /** Muda a cada gesseiro arquivado: a lista de arquivados aberta remonta e busca de novo. */
  const [versaoArquivo, setVersaoArquivo] = useState(0);
  const [arquivando, setArquivando] = useState(false);
  const refExtrato = useRef<HTMLDivElement>(null);
  /** true entre o clique num gesseiro e o extrato dele aparecer (RSP-10). */
  const rolarAoAbrir = useRef(false);

  async function carregar() {
    try {
      setGesseiros(await api.get<Gesseiro[]>('/gesseiros'));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar gesseiros');
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  // A conexão voltou: lista e extrato aberto de novo (OFF-15). O extrato é trocado pelo do
  // mesmo gesseiro, então o LancamentoForm (key = id) não remonta e não rola a tela.
  useAoReconectar(() => {
    setErro(null);
    void carregar();
    if (extrato) void abrirExtrato(extrato.gesseiro.id);
  });

  async function gesseiroCriado() {
    setMostrarForm(false);
    await carregar();
  }

  async function abrirExtrato(id: string) {
    setErro(null);
    try {
      setExtrato(await api.get<Extrato>(`/gesseiros/${id}/extrato`));
    } catch (e) {
      rolarAoAbrir.current = false;
      setErro(e instanceof Error ? e.message : 'Erro ao carregar extrato');
    }
  }

  /**
   * ARQ-10: só com saldo 0 (o botão fica desabilitado antes) e confirmação. A API confere de novo
   * o saldo e as obras abertas. Erro com resposta HTTP recarrega lista e extrato (AD-014).
   */
  async function arquivar() {
    if (!extrato || !window.confirm(confirmacaoArquivarGesseiro(extrato.gesseiro.nome))) return;
    const id = extrato.gesseiro.id;
    setArquivando(true);
    setErro(null);
    try {
      await api.patch(`/gesseiros/${id}/arquivar`);
      setExtrato(null);
      setVersaoArquivo((versao) => versao + 1);
      await carregar();
    } catch (e) {
      const mensagem = mensagemDe(e);
      if (!ehFalhaDeRede(e)) {
        await carregar();
        await abrirExtrato(id);
      }
      setErro(mensagem);
    } finally {
      setArquivando(false);
    }
  }

  function selecionar(id: string) {
    rolarAoAbrir.current = true;
    void abrirExtrato(id);
  }

  // Com lista e extrato empilhados (<= 760px), o extrato fica abaixo da lista: rola até ele.
  // Só na seleção, não ao recarregar o extrato depois de um lançamento.
  useEffect(() => {
    if (!extrato || !rolarAoAbrir.current) return;
    rolarAoAbrir.current = false;
    if (window.matchMedia('(max-width: 760px)').matches) {
      refExtrato.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }, [extrato]);

  return (
    <section>
      <div className="cabecalho-pagina">
        <div>
          <h1>Gesseiros</h1>
          <p className="subtitulo-pagina">
            Equipe, vales, pagamentos e saldo a receber de cada um.
          </p>
        </div>
        <div className="acoes">
          <button
            type="button"
            className="btn btn-secundario"
            aria-pressed={verArquivados}
            onClick={() => setVerArquivados((aberto) => !aberto)}
          >
            {verArquivados ? 'Fechar arquivados' : 'Ver arquivados'}
          </button>
          <button
            type="button"
            className={mostrarForm ? 'btn btn-secundario' : 'btn'}
            onClick={() => setMostrarForm((aberto) => !aberto)}
          >
            {!mostrarForm && <Icone nome="mais" />}
            {mostrarForm ? 'Fechar' : 'Novo gesseiro'}
          </button>
        </div>
      </div>

      {mostrarForm && <NovoGesseiroForm onSalvo={gesseiroCriado} />}

      {verArquivados && (
        <ListaArquivados<Gesseiro>
          key={versaoArquivo}
          caminho="/gesseiros"
          rotulo={(gesseiro) => gesseiro.nome}
          onRestaurado={carregar}
        />
      )}

      {erro && <p className="erro">{erro}</p>}

      <div className="duas-colunas">
        <ul className="lista lista-pessoas">
          {gesseiros.map((gesseiro) => (
            // A linha inteira abre o extrato (RSP-09). O botão do nome fica para teclado e leitor
            // de tela; o clique nele sobe até o li, então é uma chamada só.
            <li
              key={gesseiro.id}
              className={extrato?.gesseiro.id === gesseiro.id ? 'selecionado' : undefined}
              onClick={() => selecionar(gesseiro.id)}
            >
              <span className="avatar">{iniciais(gesseiro.nome)}</span>
              <span className="pessoa">
                <button type="button" className="btn-texto">
                  {gesseiro.nome}
                </button>
                <span className="secundario">{gesseiro.telefone ?? 'sem telefone'}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="card" ref={refExtrato}>
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

              <div className="card-acoes acoes-arquivar">
                <button
                  type="button"
                  className="btn btn-secundario"
                  disabled={extrato.saldoAReceber !== 0 || arquivando}
                  onClick={() => void arquivar()}
                >
                  Arquivar gesseiro
                </button>
                {extrato.saldoAReceber !== 0 && <span className="aviso-acao">{ZERE_O_SALDO}</span>}
              </div>

              <h3>Registrar vale ou pagamento</h3>
              <LancamentoForm
                key={extrato.gesseiro.id}
                gesseiroId={extrato.gesseiro.id}
                onSalvo={() => abrirExtrato(extrato.gesseiro.id)}
              />

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
