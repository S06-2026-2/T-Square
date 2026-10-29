import { useEffect, useState } from 'react';

import AlertasEstoque from '../components/AlertasEstoque';
import { api } from '../lib/api';
import { moeda } from '../lib/formato';
import { STATUS_FUNIL, rotuloPlural } from '../lib/status';
import type { ResumoStatus } from '../types';

export default function Dashboard() {
  const [resumo, setResumo] = useState<ResumoStatus[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    api
      .get<ResumoStatus[]>('/obras/resumo')
      .then(setResumo)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao carregar resumo'))
      .finally(() => setCarregando(false));
  }, []);

  // A API so devolve status com pelo menos uma obra; os demais aparecem zerados.
  const linhas = STATUS_FUNIL.map(
    (status) => resumo.find((linha) => linha.status === status) ?? { status, quantidade: 0, valorTotal: 0 },
  );

  return (
    <section>
      <div className="cabecalho-pagina">
        <div>
          <h1>Visao geral</h1>
        </div>
      </div>

      {erro && <p className="erro">{erro}</p>}
      {carregando && <p className="carregando">Carregando...</p>}

      {!carregando && !erro && (
        <div className="grade-resumo">
          {linhas.map((linha) => (
            <article key={linha.status} className="card card-resumo" data-status={linha.status}>
              <h2>{rotuloPlural[linha.status]}</h2>
              <p className="valor" data-testid="valor">
                {moeda(linha.valorTotal)}
              </p>
              <p className="secundario">
                <span data-testid="quantidade">{linha.quantidade}</span> obra(s)
              </p>
            </article>
          ))}
        </div>
      )}

      {/* Busca e erro próprios: uma falha aqui não esconde o funil, e vice-versa (EAP-34). */}
      <AlertasEstoque />
    </section>
  );
}
