import { numero } from '../../lib/corpo';
import type { Material, MaterialPrevistoItem } from '../../types';

/**
 * Uma linha do editor. A quantidade fica como o texto digitado no campo; só vira número
 * no corpo da requisição (`paraItensPrevistos`).
 */
export interface LinhaMaterialPrevisto {
  materialId: string;
  quantidade: string;
}

/** Converte as linhas do editor nos itens aceitos pela API (`MaterialPrevistoDto`). */
export function paraItensPrevistos(linhas: LinhaMaterialPrevisto[]): MaterialPrevistoItem[] {
  return linhas.map((linha) => ({
    materialId: linha.materialId,
    quantidade: numero(linha.quantidade),
  }));
}

interface Props {
  /** Materiais carregados da API: a seleção é só por esta lista, sem texto livre. */
  materiais: Material[];
  itens: LinhaMaterialPrevisto[];
  onChange: (itens: LinhaMaterialPrevisto[]) => void;
}

/**
 * Editor controlado dos materiais previstos de uma obra (material + quantidade por linha).
 * Um material já escolhido numa linha some das opções das outras, então a lista nunca
 * repete material (EAP-40). Usado na criação da obra e na edição pelo card.
 */
export default function ItensMateriaisPrevistos({ materiais, itens, onChange }: Props) {
  function alterar(indice: number, campo: keyof LinhaMaterialPrevisto, valor: string) {
    onChange(itens.map((linha, i) => (i === indice ? { ...linha, [campo]: valor } : linha)));
  }

  function adicionar() {
    onChange([...itens, { materialId: '', quantidade: '' }]);
  }

  function remover(indice: number) {
    onChange(itens.filter((_, i) => i !== indice));
  }

  return (
    <>
      {itens.map((linha, indice) => {
        const escolhidosEmOutras = itens
          .filter((_, i) => i !== indice)
          .map((outra) => outra.materialId);
        const disponiveis = materiais.filter(
          (material) => !escolhidosEmOutras.includes(material.id),
        );

        return (
          // Os campos são todos controlados pelo array, então o índice basta como chave.
          <div key={indice} className="linha-form">
            <label>
              Material
              <select
                value={linha.materialId}
                onChange={(e) => alterar(indice, 'materialId', e.target.value)}
                required
              >
                <option value="">Selecione</option>
                {disponiveis.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.nome} ({material.unidade})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quantidade
              <input
                type="number"
                min={0.01}
                step="0.01"
                value={linha.quantidade}
                onChange={(e) => alterar(indice, 'quantidade', e.target.value)}
                required
              />
            </label>
            <button
              type="button"
              className="btn-texto"
              aria-label="Remover material"
              onClick={() => remover(indice)}
            >
              Remover
            </button>
          </div>
        );
      })}
      <div className="acoes">
        <button type="button" className="btn-texto" onClick={adicionar}>
          Adicionar material
        </button>
      </div>
    </>
  );
}
