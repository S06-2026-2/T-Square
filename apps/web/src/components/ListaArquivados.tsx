import { useEffect, useState } from 'react';

import { api } from '../lib/api';
import { ehFalhaDeRede, mensagemDe } from '../lib/arquivamento';
import { dataLimpeza } from '../lib/formato';

interface Arquivado {
  id: string;
  arquivadoEm?: string | null;
}

interface Props<T extends Arquivado> {
  /** Lista da entidade, sem a query: `/obras`, `/gesseiros`, `/estoque/materiais`. */
  caminho: string;
  rotulo: (item: T) => string;
  /** Restaurado: a lista principal da página recarrega. */
  onRestaurado: () => void | Promise<void>;
}

/**
 * ARQ-08 e ARQ-07 (UI): os arquivados de uma entidade, cada um com a data em que será apagado e
 * "Restaurar". Erro de restaurar segue a AD-014: com resposta HTTP, mensagem e recarga da lista;
 * sem rede, só a mensagem (nada é reenviado sozinho).
 */
export default function ListaArquivados<T extends Arquivado>({
  caminho,
  rotulo,
  onRestaurado,
}: Props<T>) {
  const [itens, setItens] = useState<T[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [restaurando, setRestaurando] = useState<string | null>(null);

  async function carregar() {
    try {
      setItens(await api.get<T[]>(`${caminho}?arquivados=true`));
    } catch (e) {
      setErro(mensagemDe(e));
    }
  }

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caminho]);

  async function restaurar(id: string) {
    setRestaurando(id);
    setErro(null);
    try {
      await api.patch(`${caminho}/${id}/restaurar`);
      setItens((atual) => atual?.filter((item) => item.id !== id) ?? null);
      await onRestaurado();
    } catch (e) {
      setErro(mensagemDe(e));
      if (!ehFalhaDeRede(e)) await carregar();
    } finally {
      setRestaurando(null);
    }
  }

  return (
    <div className="card lista-arquivados" aria-label="Arquivados">
      <h2>Arquivados</h2>
      {erro && <p className="erro">{erro}</p>}
      {itens === null && !erro && <p className="secundario">Carregando...</p>}
      {itens?.length === 0 && <p className="secundario">Nada arquivado.</p>}
      {itens && itens.length > 0 && (
        <ul className="lista">
          {itens.map((item) => (
            <li key={item.id}>
              <span className="pessoa">
                <span className="rotulo-arquivado">{rotulo(item)}</span>
                <span className="secundario">Será apagado em {dataLimpeza(item.arquivadoEm)}</span>
              </span>
              <button
                type="button"
                className="btn btn-secundario"
                disabled={restaurando !== null}
                onClick={() => void restaurar(item.id)}
              >
                Restaurar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
