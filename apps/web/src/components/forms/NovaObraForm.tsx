import { FormEvent, useState } from 'react';

import { api } from '../../lib/api';
import { numero, numeroOpcional, semVazios, textoOpcional } from '../../lib/corpo';
import { useEnvio } from '../../lib/useEnvio';
import type { FormaPagamento, Gesseiro } from '../../types';

const formas: Array<{ valor: FormaPagamento; rotulo: string }> = [
  { valor: 'PIX', rotulo: 'Pix' },
  { valor: 'DINHEIRO', rotulo: 'Dinheiro' },
  { valor: 'CARTAO_CREDITO', rotulo: 'Cartao de credito' },
  { valor: 'CARTAO_DEBITO', rotulo: 'Cartao de debito' },
  { valor: 'BOLETO', rotulo: 'Boleto' },
  { valor: 'TRANSFERENCIA', rotulo: 'Transferencia' },
];

interface LinhaEquipe {
  /** Chave interna do React; nunca vai no corpo da requisicao. */
  chave: number;
  gesseiroId: string;
  valorCombinado: string;
  funcao: string;
}

export interface EstadoNovaObra {
  titulo: string;
  clienteNome: string;
  valorTotal: string;
  descricao: string;
  clienteTelefone: string;
  endereco: string;
  plantaBaixaUrl: string;
  forma: FormaPagamento | '';
  parcelas: string;
  valorEntrada: string;
  equipe: LinhaEquipe[];
}

const vazio: EstadoNovaObra = {
  titulo: '',
  clienteNome: '',
  valorTotal: '',
  descricao: '',
  clienteTelefone: '',
  endereco: '',
  plantaBaixaUrl: '',
  forma: '',
  parcelas: '',
  valorEntrada: '',
  equipe: [],
};

/** Converte o estado do formulario no corpo aceito por POST /obras (CreateObraDto). */
export function montarCorpoObra(estado: EstadoNovaObra) {
  return semVazios({
    titulo: estado.titulo.trim(),
    clienteNome: estado.clienteNome.trim(),
    valorTotal: numero(estado.valorTotal),
    descricao: textoOpcional(estado.descricao),
    clienteTelefone: textoOpcional(estado.clienteTelefone),
    endereco: textoOpcional(estado.endereco),
    plantaBaixaUrl: textoOpcional(estado.plantaBaixaUrl),
    pagamento: estado.forma
      ? semVazios({
          forma: estado.forma,
          parcelas: numeroOpcional(estado.parcelas),
          valorEntrada: numeroOpcional(estado.valorEntrada),
        })
      : undefined,
    gesseiros: estado.equipe.length
      ? estado.equipe.map((linha) =>
          semVazios({
            gesseiroId: linha.gesseiroId,
            valorCombinado: numero(linha.valorCombinado),
            funcao: textoOpcional(linha.funcao),
          }),
        )
      : undefined,
  });
}

interface Props {
  gesseiros: Gesseiro[];
  onSalvo: () => void | Promise<void>;
}

export default function NovaObraForm({ gesseiros, onSalvo }: Props) {
  const [estado, setEstado] = useState<EstadoNovaObra>(vazio);
  const [proximaChave, setProximaChave] = useState(1);
  const { enviando, erro, enviar } = useEnvio();

  const ativos = gesseiros.filter((gesseiro) => gesseiro.ativo);

  function alterar<K extends keyof EstadoNovaObra>(campo: K, valor: EstadoNovaObra[K]) {
    setEstado((atual) => ({ ...atual, [campo]: valor }));
  }

  function alterarLinha(chave: number, campo: keyof Omit<LinhaEquipe, 'chave'>, valor: string) {
    setEstado((atual) => ({
      ...atual,
      equipe: atual.equipe.map((linha) =>
        linha.chave === chave ? { ...linha, [campo]: valor } : linha,
      ),
    }));
  }

  function adicionarLinha() {
    setEstado((atual) => ({
      ...atual,
      equipe: [
        ...atual.equipe,
        { chave: proximaChave, gesseiroId: '', valorCombinado: '', funcao: '' },
      ],
    }));
    setProximaChave((chave) => chave + 1);
  }

  function removerLinha(chave: number) {
    setEstado((atual) => ({
      ...atual,
      equipe: atual.equipe.filter((linha) => linha.chave !== chave),
    }));
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    const ok = await enviar(async () => {
      await api.post('/obras', montarCorpoObra(estado));
    });
    if (ok) {
      setEstado(vazio);
      await onSalvo();
    }
  }

  return (
    <form className="card formulario" onSubmit={salvar}>
      <label>
        Titulo
        <input
          value={estado.titulo}
          onChange={(e) => alterar('titulo', e.target.value)}
          required
          minLength={3}
        />
      </label>
      <label>
        Cliente
        <input
          value={estado.clienteNome}
          onChange={(e) => alterar('clienteNome', e.target.value)}
          required
          minLength={3}
        />
      </label>
      <label>
        Valor total
        <input
          type="number"
          min={0}
          step="0.01"
          value={estado.valorTotal}
          onChange={(e) => alterar('valorTotal', e.target.value)}
          required
        />
      </label>
      <label>
        Telefone do cliente
        <input
          value={estado.clienteTelefone}
          onChange={(e) => alterar('clienteTelefone', e.target.value)}
        />
      </label>
      <label>
        Endereco
        <input value={estado.endereco} onChange={(e) => alterar('endereco', e.target.value)} />
      </label>
      <label>
        Planta baixa (URL)
        <input
          type="url"
          value={estado.plantaBaixaUrl}
          onChange={(e) => alterar('plantaBaixaUrl', e.target.value)}
        />
      </label>
      <label>
        Descricao
        <textarea
          value={estado.descricao}
          onChange={(e) => alterar('descricao', e.target.value)}
        />
      </label>

      <fieldset>
        <legend>Pagamento</legend>
        <label>
          Forma de pagamento
          <select
            value={estado.forma}
            onChange={(e) => alterar('forma', e.target.value as FormaPagamento | '')}
          >
            <option value="">Sem pagamento definido</option>
            {formas.map((forma) => (
              <option key={forma.valor} value={forma.valor}>
                {forma.rotulo}
              </option>
            ))}
          </select>
        </label>
        {estado.forma && (
          <>
            <label>
              Parcelas
              <input
                type="number"
                min={1}
                step={1}
                value={estado.parcelas}
                onChange={(e) => alterar('parcelas', e.target.value)}
              />
            </label>
            <label>
              Valor de entrada
              <input
                type="number"
                min={0}
                step="0.01"
                value={estado.valorEntrada}
                onChange={(e) => alterar('valorEntrada', e.target.value)}
              />
            </label>
          </>
        )}
      </fieldset>

      <fieldset>
        <legend>Equipe</legend>
        {estado.equipe.map((linha) => {
          const escolhidosEmOutras = estado.equipe
            .filter((outra) => outra.chave !== linha.chave)
            .map((outra) => outra.gesseiroId);
          const disponiveis = ativos.filter(
            (gesseiro) => !escolhidosEmOutras.includes(gesseiro.id),
          );

          return (
            <div key={linha.chave} className="linha-form">
              <label>
                Gesseiro
                <select
                  value={linha.gesseiroId}
                  onChange={(e) => alterarLinha(linha.chave, 'gesseiroId', e.target.value)}
                  required
                >
                  <option value="">Selecione</option>
                  {disponiveis.map((gesseiro) => (
                    <option key={gesseiro.id} value={gesseiro.id}>
                      {gesseiro.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Valor combinado
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={linha.valorCombinado}
                  onChange={(e) => alterarLinha(linha.chave, 'valorCombinado', e.target.value)}
                  required
                />
              </label>
              <label>
                Funcao
                <input
                  value={linha.funcao}
                  onChange={(e) => alterarLinha(linha.chave, 'funcao', e.target.value)}
                />
              </label>
              <button type="button" className="btn-texto" onClick={() => removerLinha(linha.chave)}>
                Remover
              </button>
            </div>
          );
        })}
        <div className="acoes">
          <button type="button" className="btn-texto" onClick={adicionarLinha}>
            Adicionar gesseiro
          </button>
        </div>
      </fieldset>

      {erro && <p className="erro">{erro}</p>}

      <div className="acoes">
        <button type="submit" className="btn" disabled={enviando}>
          Salvar obra
        </button>
      </div>
    </form>
  );
}
