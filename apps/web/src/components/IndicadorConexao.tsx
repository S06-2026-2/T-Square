import { useDesatualizado } from '../lib/conexao';
import Icone from './Icone';

const ROTULO = 'Dados possivelmente desatualizados';

/**
 * Ícone vermelho de sinal no topo (OFF-06): navegador offline ou última resposta GET vinda do
 * cache. Some com a primeira resposta da rede (OFF-07). Sem texto visível; o nome vai no
 * `aria-label` e no `title`.
 */
export default function IndicadorConexao() {
  const desatualizado = useDesatualizado();
  if (!desatualizado) return null;

  return (
    <span className="indicador-conexao" role="img" aria-label={ROTULO} title={ROTULO}>
      <Icone nome="wifi-off" />
    </span>
  );
}
