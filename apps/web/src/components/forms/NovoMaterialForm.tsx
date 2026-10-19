import { FormEvent, useState } from 'react';

import { api } from '../../lib/api';
import { numeroOpcional, semVazios } from '../../lib/corpo';
import { useEnvio } from '../../lib/useEnvio';

interface Props {
  onSalvo: () => void | Promise<void>;
}

/** Cadastro de material; sem estoque minimo, o backend usa 0. */
export default function NovoMaterialForm({ onSalvo }: Props) {
  const [nome, setNome] = useState('');
  const [unidade, setUnidade] = useState('');
  const [estoqueMinimo, setEstoqueMinimo] = useState('');
  const { enviando, erro, enviar } = useEnvio();

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    const ok = await enviar(async () => {
      await api.post(
        '/estoque/materiais',
        semVazios({
          nome: nome.trim(),
          unidade: unidade.trim(),
          estoqueMinimo: numeroOpcional(estoqueMinimo),
        }),
      );
    });
    if (ok) {
      setNome('');
      setUnidade('');
      setEstoqueMinimo('');
      await onSalvo();
    }
  }

  return (
    <form className="card formulario" onSubmit={salvar}>
      <label>
        Nome
        <input value={nome} onChange={(e) => setNome(e.target.value)} required minLength={2} />
      </label>
      <label>
        Unidade
        <input
          value={unidade}
          onChange={(e) => setUnidade(e.target.value)}
          placeholder="un, saco, m2, kg..."
          required
        />
      </label>
      <label>
        Estoque minimo
        <input
          type="number"
          min={0}
          step="0.01"
          value={estoqueMinimo}
          onChange={(e) => setEstoqueMinimo(e.target.value)}
        />
      </label>

      {erro && <p className="erro">{erro}</p>}

      <div className="acoes">
        <button type="submit" className="btn" disabled={enviando}>
          Salvar material
        </button>
      </div>
    </form>
  );
}
