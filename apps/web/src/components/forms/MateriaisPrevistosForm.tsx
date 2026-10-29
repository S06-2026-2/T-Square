import { FormEvent, useEffect, useState } from 'react';

import { api } from '../../lib/api';
import { numero, situacaoPrevisto } from '../../lib/formato';
import { useEnvio } from '../../lib/useEnvio';
import type { LinhaPrevistoUtilizado, Material, StatusObra } from '../../types';
import ItensMateriaisPrevistos, {
  LinhaMaterialPrevisto,
  paraItensPrevistos,
} from './ItensMateriaisPrevistos';

/** Status em que a API aceita alterar os previstos; CONCLUIDA e CANCELADA recusam com 400. */
const aceitaEdicao: StatusObra[] = ['ORCAMENTO', 'FECHADA', 'ANDAMENTO'];

interface Props {
  obraId: string;
  status: StatusObra;
}

/**
 * Linhas do editor a partir da tabela: o previsto vai como texto para o campo, sem conversão.
 * Material usado sem previsão fica só na tabela; não vira item previsto (EAP-70).
 */
function paraLinhasEditor(linhas: LinhaPrevistoUtilizado[]): LinhaMaterialPrevisto[] {
  return linhas
    .filter((linha) => !linha.semPrevisao)
    .map((linha) => ({ materialId: linha.materialId, quantidade: linha.previsto }));
}

/**
 * Previsto x utilizado de uma obra (tabela), incluindo materiais usados sem previsão, e, em status editável, o editor que substitui a
 * lista inteira por PUT /obras/:id/materiais-previstos. Os números da tabela vêm prontos da
 * API e só são formatados para exibição.
 */
export default function MateriaisPrevistosForm({ obraId, status }: Props) {
  const editavel = aceitaEdicao.includes(status);
  const [linhas, setLinhas] = useState<LinhaPrevistoUtilizado[]>([]);
  const [itens, setItens] = useState<LinhaMaterialPrevisto[]>([]);
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const { enviando, erro, enviar } = useEnvio();

  async function carregarPrevistos() {
    const resposta = await api.get<LinhaPrevistoUtilizado[]>(
      `/obras/${obraId}/materiais-previstos`,
    );
    setLinhas(resposta);
    setItens(paraLinhasEditor(resposta));
  }

  useEffect(() => {
    setCarregando(true);
    setErroCarga(null);
    Promise.all([
      carregarPrevistos(),
      editavel ? api.get<Material[]>('/estoque/materiais').then(setMateriais) : undefined,
    ])
      .catch((e) =>
        setErroCarga(e instanceof Error ? e.message : 'Erro ao carregar materiais previstos'),
      )
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obraId, editavel]);

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    await enviar(async () => {
      await api.put(`/obras/${obraId}/materiais-previstos`, {
        itens: paraItensPrevistos(itens),
      });
      await carregarPrevistos();
    });
  }

  if (carregando) return <p className="carregando">Carregando...</p>;
  if (erroCarga) return <p className="erro">{erroCarga}</p>;

  return (
    <div className="form-card">
      {linhas.length === 0 ? (
        <p className="secundario">Nenhum material previsto</p>
      ) : (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr>
                <th>Material</th>
                <th className="num">Previsto</th>
                <th className="num">Utilizado</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha) => (
                <tr key={linha.materialId}>
                  <td>
                    {linha.material} ({linha.unidade})
                  </td>
                  <td className="num">{linha.semPrevisao ? '—' : numero(linha.previsto)}</td>
                  <td className="num">{numero(linha.utilizado)}</td>
                  <td>{linha.semPrevisao ? 'não previsto' : situacaoPrevisto(linha)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editavel && (
        <form className="form-card" onSubmit={salvar}>
          <ItensMateriaisPrevistos materiais={materiais} itens={itens} onChange={setItens} />

          {erro && <p className="erro">{erro}</p>}

          <button type="submit" className="btn" disabled={enviando}>
            Salvar materiais
          </button>
        </form>
      )}
    </div>
  );
}
