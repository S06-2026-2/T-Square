import { FormEvent, useState } from 'react';

import { api } from '../../lib/api';
import { numero, semVazios, textoOpcional } from '../../lib/corpo';
import { useEnvio } from '../../lib/useEnvio';
import type { Gesseiro } from '../../types';

interface Props {
  obraId: string;
  gesseiros: Gesseiro[];
  onSalvo: () => void | Promise<void>;
}

/**
 * Aloca um gesseiro numa obra existente. Se ele ja estiver alocado,
 * o backend faz upsert e so atualiza valor combinado e funcao.
 */
export default function AlocarGesseiroForm({ obraId, gesseiros, onSalvo }: Props) {
  const [gesseiroId, setGesseiroId] = useState('');
  const [valorCombinado, setValorCombinado] = useState('');
  const [funcao, setFuncao] = useState('');
  const { enviando, erro, enviar } = useEnvio();

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    const ok = await enviar(async () => {
      await api.post(
        `/obras/${obraId}/gesseiros`,
        semVazios({
          gesseiroId,
          valorCombinado: numero(valorCombinado),
          funcao: textoOpcional(funcao),
        }),
      );
    });
    if (ok) {
      setGesseiroId('');
      setValorCombinado('');
      setFuncao('');
      await onSalvo();
    }
  }

  return (
    <form className="form-card" onSubmit={salvar}>
      <label>
        Gesseiro
        <select value={gesseiroId} onChange={(e) => setGesseiroId(e.target.value)} required>
          <option value="">Selecione</option>
          {gesseiros
            .filter((gesseiro) => gesseiro.ativo)
            .map((gesseiro) => (
              <option key={gesseiro.id} value={gesseiro.id}>
                {gesseiro.nome}
              </option>
            ))}
        </select>
      </label>
      <label>
        Valor combinado
        <input
          type="number"
          min={0}
          step="0.01"
          value={valorCombinado}
          onChange={(e) => setValorCombinado(e.target.value)}
          required
        />
      </label>
      <label>
        Funcao
        <input value={funcao} onChange={(e) => setFuncao(e.target.value)} />
      </label>

      {erro && <p className="erro">{erro}</p>}

      <button type="submit" className="btn" disabled={enviando}>
        Alocar
      </button>
    </form>
  );
}
