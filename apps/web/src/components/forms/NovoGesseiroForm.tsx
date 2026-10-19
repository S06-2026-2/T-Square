import { FormEvent, useState } from 'react';

import { api } from '../../lib/api';
import { semVazios, textoOpcional } from '../../lib/corpo';
import { useEnvio } from '../../lib/useEnvio';

interface Props {
  onSalvo: () => void | Promise<void>;
}

/** Cadastro de gesseiro; telefone e chave Pix vazios nao vao no corpo. */
export default function NovoGesseiroForm({ onSalvo }: Props) {
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [chavePix, setChavePix] = useState('');
  const { enviando, erro, enviar } = useEnvio();

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    const ok = await enviar(async () => {
      await api.post(
        '/gesseiros',
        semVazios({
          nome: nome.trim(),
          telefone: textoOpcional(telefone),
          chavePix: textoOpcional(chavePix),
        }),
      );
    });
    if (ok) {
      setNome('');
      setTelefone('');
      setChavePix('');
      await onSalvo();
    }
  }

  return (
    <form className="card formulario" onSubmit={salvar}>
      <label>
        Nome
        <input value={nome} onChange={(e) => setNome(e.target.value)} required minLength={3} />
      </label>
      <label>
        Telefone
        <input value={telefone} onChange={(e) => setTelefone(e.target.value)} />
      </label>
      <label>
        Chave Pix
        <input value={chavePix} onChange={(e) => setChavePix(e.target.value)} />
      </label>

      {erro && <p className="erro">{erro}</p>}

      <div className="acoes">
        <button type="submit" className="btn" disabled={enviando}>
          Salvar gesseiro
        </button>
      </div>
    </form>
  );
}
