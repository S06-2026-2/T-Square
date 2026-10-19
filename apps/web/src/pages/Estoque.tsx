import { useEffect, useState } from 'react';

import MovimentacaoForm from '../components/forms/MovimentacaoForm';
import NovoMaterialForm from '../components/forms/NovoMaterialForm';
import Icone from '../components/Icone';
import { api } from '../lib/api';
import type { Material, Obra } from '../types';

type FormAberto = 'material' | 'movimentacao' | null;

export default function Estoque() {
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [obras, setObras] = useState<Obra[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [formAberto, setFormAberto] = useState<FormAberto>(null);

  async function carregar() {
    try {
      setMateriais(await api.get<Material[]>('/estoque/materiais'));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar estoque');
    }
  }

  useEffect(() => {
    void carregar();
    api
      .get<Obra[]>('/obras')
      .then(setObras)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao carregar obras'));
  }, []);

  function alternar(form: Exclude<FormAberto, null>) {
    setFormAberto((atual) => (atual === form ? null : form));
  }

  async function salvo() {
    setFormAberto(null);
    await carregar();
  }

  return (
    <section>
      <div className="cabecalho-pagina">
        <div>
          <h1>Estoque</h1>
          <p className="subtitulo-pagina">Saldo de materiais e alerta de reposicao.</p>
        </div>
        <div className="acoes">
          <button
            type="button"
            className={formAberto === 'movimentacao' ? 'btn' : 'btn btn-secundario'}
            onClick={() => alternar('movimentacao')}
          >
            Registrar entrada/saida
          </button>
          <button
            type="button"
            className={formAberto === 'material' ? 'btn btn-secundario' : 'btn'}
            onClick={() => alternar('material')}
          >
            {formAberto !== 'material' && <Icone nome="mais" />}
            {formAberto === 'material' ? 'Fechar' : 'Novo material'}
          </button>
        </div>
      </div>

      {formAberto === 'material' && <NovoMaterialForm onSalvo={salvo} />}
      {formAberto === 'movimentacao' && (
        <MovimentacaoForm materiais={materiais} obras={obras} onSalvo={salvo} />
      )}

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
