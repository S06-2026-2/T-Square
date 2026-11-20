import { FormEvent, useState } from 'react';

import { api } from '../../lib/api';
import { numero } from '../../lib/corpo';
import { moeda } from '../../lib/formato';
import { useEnvio } from '../../lib/useEnvio';
import type { Obra } from '../../types';

interface Props {
  obra: Obra;
  onSalvo: () => void | Promise<void>;
}

/**
 * ARQ-02: quanto o cliente já pagou, de 0 até o valor total. É o que libera o "Arquivar obra"
 * (o cliente precisa ter pagado tudo). O PATCH é idempotente por natureza: não leva chave.
 */
export default function ValorRecebidoForm({ obra, onSalvo }: Props) {
  const recebido = Number(obra.valorRecebido ?? 0);
  const [valor, setValor] = useState(String(recebido));
  const { enviando, erro, enviar } = useEnvio();

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    const ok = await enviar(async () => {
      await api.patch(`/obras/${obra.id}`, { valorRecebido: numero(valor) });
    });
    if (ok) await onSalvo();
  }

  return (
    <form className="valor-recebido" onSubmit={salvar}>
      <p className="secundario">
        Recebido {moeda(recebido)} de {moeda(obra.valorTotal)}
      </p>
      <div className="linha-campo">
        <label>
          Valor recebido do cliente
          <input
            type="number"
            min={0}
            max={Number(obra.valorTotal)}
            step={0.01}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            required
          />
        </label>
        <button type="submit" className="btn btn-secundario" disabled={enviando}>
          Salvar
        </button>
      </div>
      {erro && <p className="erro">{erro}</p>}
    </form>
  );
}
