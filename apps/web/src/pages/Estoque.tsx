import { useEffect, useState } from 'react';

import { api } from '../lib/api';
import type { Material } from '../types';

export default function Estoque() {
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Material[]>('/estoque/materiais')
      .then(setMateriais)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao carregar estoque'));
  }, []);

  return (
    <section>
      <div className="cabecalho-pagina">
        <h1>Estoque</h1>
        {/* TODO(equipe): botoes de "Novo material" e "Registrar entrada/saida" */}
      </div>

      {erro && <p className="erro">{erro}</p>}

      <table className="tabela">
        <thead>
          <tr>
            <th>Material</th>
            <th>Unidade</th>
            <th>Saldo</th>
            <th>Minimo</th>
            <th>Situacao</th>
          </tr>
        </thead>
        <tbody>
          {materiais.map((material) => {
            const abaixo = Number(material.saldoAtual) <= Number(material.estoqueMinimo);
            return (
              <tr key={material.id}>
                <td>{material.nome}</td>
                <td>{material.unidade}</td>
                <td>{Number(material.saldoAtual)}</td>
                <td>{Number(material.estoqueMinimo)}</td>
                <td>
                  <span className={abaixo ? 'badge badge-alerta' : 'badge badge-ok'}>
                    {abaixo ? 'Repor' : 'Ok'}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {materiais.length === 0 && !erro && <p>Nenhum material cadastrado.</p>}
    </section>
  );
}
