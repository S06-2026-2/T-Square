import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '../lib/api';
import { dataHora } from '../lib/formato';
import type { AlertaEstoque, RespostaAlertasEstoque, StatusAnaliseEstoque } from '../types';
import CardAlertaEstoque from './CardAlertaEstoque';
import Icone from './Icone';
import SilenciadosEstoque from './SilenciadosEstoque';

/** Status de análise que pedem aviso junto dos alertas (EAP-33). */
const avisoStatus: Partial<Record<StatusAnaliseEstoque, string>> = {
  FALHA: 'o agente não respondeu; os alertas abaixo vêm das análises anteriores e da regra básica.',
  PARCIAL:
    'o agente parou no limite de tempo ou de chamadas; os alertas abaixo podem estar incompletos.',
};

/**
 * Atalho do "Resolver" de um REPOSICAO (EAP-68): o Estoque abre a ENTRADA já preenchida
 * e só resolve o alerta quando a entrada é salva.
 */
function caminhoEntrada(alerta: AlertaEstoque): string {
  const params = new URLSearchParams({ alerta: alerta.id, material: alerta.materialId });
  if (alerta.quantidadeSugerida !== null) {
    params.set('quantidade', String(Number(alerta.quantidadeSugerida)));
  }
  return `/estoque?${params}`;
}

/**
 * Seção do Dashboard com os alertas do agente de estoque.
 * A API devolve os alertas já na ordem de urgência; a lista não é reordenada aqui.
 */
export default function AlertasEstoque() {
  const [resposta, setResposta] = useState<RespostaAlertasEstoque | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [analisando, setAnalisando] = useState(false);
  /** id do alerta com Dispensar/Resolver em andamento. */
  const [agindo, setAgindo] = useState<string | null>(null);
  const navigate = useNavigate();

  async function carregar() {
    try {
      setResposta(await api.get<RespostaAlertasEstoque>('/estoque/agente/alertas'));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar alertas de estoque');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  /** POST síncrono: a API só responde com a análise terminada; depois recarrega os alertas. */
  async function rodarAnalise() {
    setErro(null);
    setAnalisando(true);
    try {
      await api.post('/estoque/agente/analisar');
      await carregar();
    } catch (e) {
      // 409 (análise em andamento) e 429 (limite de 1 min) chegam com a mensagem da API.
      setErro(e instanceof Error ? e.message : 'Erro ao rodar a análise');
    } finally {
      setAnalisando(false);
    }
  }

  async function agir(id: string, acao: 'dispensar' | 'resolver') {
    setErro(null);
    setAgindo(id);
    try {
      await api.patch(`/estoque/agente/alertas/${id}/${acao}`);
      setResposta(
        (atual) => atual && { ...atual, alertas: atual.alertas.filter((a) => a.id !== id) },
      );
    } catch (e) {
      // O card fica na lista; só a mensagem aparece (EAP-53).
      setErro(e instanceof Error ? e.message : 'Erro ao atualizar o alerta');
    } finally {
      setAgindo(null);
    }
  }

  const ultima = resposta?.ultimaAnalise ?? null;
  const aviso = ultima ? avisoStatus[ultima.status] : undefined;

  return (
    <section className="secao-alertas" aria-labelledby="titulo-alertas">
      <div className="cabecalho-secao">
        <div>
          <h3 id="titulo-alertas">Reposição de estoque</h3>
          {resposta && (
            <p className="subtitulo-pagina" data-testid="ultima-analise">
              {ultima
                ? `Última análise: ${dataHora(ultima.iniciadoEm)}`
                : 'Nenhuma análise executada ainda'}
            </p>
          )}
        </div>
        <div className="acoes-secao">
          <SilenciadosEstoque />
          <button
            type="button"
            className="btn"
            disabled={analisando}
            onClick={() => void rodarAnalise()}
          >
            {analisando ? 'Analisando...' : 'Rodar análise agora'}
          </button>
        </div>
      </div>

      {erro && <p className="erro">{erro}</p>}
      {/* "Carregando alertas..." e não "Carregando...": o Dashboard mostra as duas seções ao mesmo
          tempo, e o texto do funil já é "Carregando...". */}
      {carregando && <p className="carregando">Carregando alertas...</p>}

      {ultima && aviso && (
        <p className="aviso" data-testid="aviso-analise">
          A última análise terminou com status {ultima.status}: {aviso}
        </p>
      )}

      {ultima && resposta && resposta.alertas.length === 0 && (
        <div className="estado-vazio">
          <Icone nome="estoque" tamanho={28} />
          <p>Estoque em dia</p>
        </div>
      )}

      {ultima && resposta && resposta.alertas.length > 0 && (
        <ul className="lista-alertas">
          {resposta.alertas.map((alerta) => (
            <CardAlertaEstoque
              key={alerta.id}
              alerta={alerta}
              ocupado={agindo === alerta.id}
              onDispensar={() => void agir(alerta.id, 'dispensar')}
              onResolver={() =>
                alerta.tipo === 'REPOSICAO'
                  ? navigate(caminhoEntrada(alerta))
                  : void agir(alerta.id, 'resolver')
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}
