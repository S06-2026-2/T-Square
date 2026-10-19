import { FormEvent, useState } from 'react';

import { api } from '../../lib/api';
import { numero, semVazios, textoOpcional } from '../../lib/corpo';
import { useEnvio } from '../../lib/useEnvio';

interface Props {
  gesseiroId: string;
  onSalvo: () => void | Promise<void>;
}

/** CREDITO nao entra: ele e gerado pela conclusao da obra, nunca a mao. */
const tipos = [
  { valor: 'VALE', rotulo: 'Vale' },
  { valor: 'PAGAMENTO', rotulo: 'Pagamento' },
] as const;

type TipoManual = (typeof tipos)[number]['valor'];

/** Registra vale ou pagamento para o gesseiro do extrato aberto. */
export default function LancamentoForm({ gesseiroId, onSalvo }: Props) {
  const [tipo, setTipo] = useState<TipoManual>('VALE');
  const [valor, setValor] = useState('');
  const [descricao, setDescricao] = useState('');
  const { enviando, erro, enviar } = useEnvio();

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    const ok = await enviar(async () => {
      await api.post(
        `/gesseiros/${gesseiroId}/lancamentos`,
        semVazios({ tipo, valor: numero(valor), descricao: textoOpcional(descricao) }),
      );
    });
    if (ok) {
      setValor('');
      setDescricao('');
      await onSalvo();
    }
  }

  return (
    <form className="form-card" onSubmit={salvar}>
      <label>
        Tipo
        <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoManual)}>
          {tipos.map((opcao) => (
            <option key={opcao.valor} value={opcao.valor}>
              {opcao.rotulo}
            </option>
          ))}
        </select>
      </label>
      <label>
        Valor
        <input
          type="number"
          min={0.01}
          step="0.01"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          required
        />
      </label>
      <label>
        Descricao
        <input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </label>

      {erro && <p className="erro">{erro}</p>}

      <button type="submit" className="btn" disabled={enviando}>
        Registrar
      </button>
    </form>
  );
}
