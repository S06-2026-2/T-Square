import { useEffect, useState } from 'react';

import Icone from '../components/Icone';
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
        <div>
          <h1>Estoque</h1>
          <p className="subtitulo-pagina">Saldo de materiais e alerta de reposicao.</p>
        </div>
        {/* TODO(equipe): botoes de "Novo material" e "Registrar entrada/saida" */}
      </div>

      {erro && <p className="erro">{erro}</p>}

      <div className="tabela-wrap">
        <table className="tabela">
          <thead>
            <tr>
              <th>Material</th>
              <th>Unidade</th>
              <th className="num">Saldo</th>
              <th className="num">Minimo</th>
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
                  <td className="num">{Number(material.saldoAtual)}</td>
                  <td className="num">{Number(material.estoqueMinimo)}</td>
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
      </div>

      {materiais.length === 0 && !erro && (
        <div className="estado-vazio">
          <Icone nome="estoque" tamanho={28} />
          <p>Nenhum material cadastrado.</p>
        </div>
      )}
    </section>
  );
}
