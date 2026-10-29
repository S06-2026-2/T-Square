import { FormEvent, useState } from 'react';

import { api } from '../../lib/api';
import { numero, semVazios, textoOpcional } from '../../lib/corpo';
import { useEnvio } from '../../lib/useEnvio';
import type { Material, Obra } from '../../types';

interface Props {
  materiais: Material[];
  obras: Obra[];
  onSalvo: () => void | Promise<void>;
  /** Valores iniciais de uma ENTRADA (atalho do "Resolver" de um alerta de reposicao). */
  inicial?: { materialId: string; quantidade: string };
}

type TipoMovimentacao = 'ENTRADA' | 'SAIDA';

/** Entrada ou saida de material; so a SAIDA pode apontar a obra que consumiu. */
export default function MovimentacaoForm({ materiais, obras, onSalvo, inicial }: Props) {
  const [materialId, setMaterialId] = useState(inicial?.materialId ?? '');
  const [tipo, setTipo] = useState<TipoMovimentacao>('ENTRADA');
  const [quantidade, setQuantidade] = useState(inicial?.quantidade ?? '');
  const [obraId, setObraId] = useState('');
  const [observacao, setObservacao] = useState('');
  const { enviando, erro, enviar } = useEnvio();

  function trocarTipo(novo: TipoMovimentacao) {
    setTipo(novo);
    if (novo === 'ENTRADA') setObraId('');
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    const ok = await enviar(async () => {
      await api.post(
        '/estoque/movimentacoes',
        semVazios({
          materialId,
          tipo,
          quantidade: numero(quantidade),
          obraId: tipo === 'SAIDA' ? textoOpcional(obraId) : undefined,
          observacao: textoOpcional(observacao),
        }),
      );
    });
    if (ok) {
      setQuantidade('');
      setObraId('');
      setObservacao('');
      await onSalvo();
    }
  }

  return (
    <form className="card formulario" onSubmit={salvar}>
      <label>
        Material
        <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} required>
          <option value="">Selecione</option>
          {materiais.map((material) => (
            <option key={material.id} value={material.id}>
              {material.nome} ({material.unidade})
            </option>
          ))}
        </select>
      </label>
      <label>
        Tipo
        <select
          value={tipo}
          onChange={(e) => trocarTipo(e.target.value as TipoMovimentacao)}
          required
        >
          <option value="ENTRADA">Entrada</option>
          <option value="SAIDA">Saida</option>
        </select>
      </label>
      <label>
        Quantidade
        <input
          type="number"
          min={0.01}
          step="0.01"
          value={quantidade}
          onChange={(e) => setQuantidade(e.target.value)}
          required
        />
      </label>
      {tipo === 'SAIDA' && (
        <label>
          Obra
          <select value={obraId} onChange={(e) => setObraId(e.target.value)}>
            <option value="">Nenhuma</option>
            {obras.map((obra) => (
              <option key={obra.id} value={obra.id}>
                {obra.titulo}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Observacao
        <input value={observacao} onChange={(e) => setObservacao(e.target.value)} />
      </label>

      {erro && <p className="erro">{erro}</p>}

      <div className="acoes">
        <button type="submit" className="btn" disabled={enviando}>
          Registrar movimentacao
        </button>
      </div>
    </form>
  );
}
