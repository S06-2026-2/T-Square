import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';

import type { Material } from '../../types';
import ItensMateriaisPrevistos, {
  LinhaMaterialPrevisto,
  paraItensPrevistos,
} from './ItensMateriaisPrevistos';

const materiais: Material[] = [
  { id: 'm-cal', nome: 'Cal', unidade: 'saco', saldoAtual: '25', estoqueMinimo: '10' },
  { id: 'm-gesso', nome: 'Gesso', unidade: 'saco', saldoAtual: '40', estoqueMinimo: '5' },
  { id: 'm-placa', nome: 'Placa', unidade: 'un', saldoAtual: '100', estoqueMinimo: '20' },
];

/** Dono do estado, como o formulário que usa o editor; registra cada onChange. */
function Editor({
  inicial = [],
  onChange,
}: {
  inicial?: LinhaMaterialPrevisto[];
  onChange: jest.Mock;
}) {
  const [itens, setItens] = useState(inicial);
  return (
    <ItensMateriaisPrevistos
      materiais={materiais}
      itens={itens}
      onChange={(novos) => {
        onChange(novos);
        setItens(novos);
      }}
    />
  );
}

function opcoes(select: HTMLElement) {
  return within(select)
    .getAllByRole('option')
    .map((opcao) => (opcao as HTMLOptionElement).value)
    .filter(Boolean);
}

function ultimoOnChange(onChange: jest.Mock) {
  return onChange.mock.calls[onChange.mock.calls.length - 1][0];
}

function adicionar() {
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar material' }));
}

describe('ItensMateriaisPrevistos', () => {
  it('adiciona uma linha vazia e entrega { materialId, quantidade } ao editar', () => {
    const onChange = jest.fn();
    render(<Editor onChange={onChange} />);

    expect(screen.queryByLabelText('Material')).not.toBeInTheDocument();
    adicionar();
    expect(ultimoOnChange(onChange)).toEqual([{ materialId: '', quantidade: '' }]);

    fireEvent.change(screen.getByLabelText('Material'), { target: { value: 'm-cal' } });
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '20' } });

    expect(ultimoOnChange(onChange)).toEqual([{ materialId: 'm-cal', quantidade: '20' }]);
    expect(screen.getByLabelText('Material')).toBeRequired();
    expect(screen.getByLabelText('Quantidade')).toBeRequired();
  });

  it('edita a quantidade de uma linha existente sem mexer nas outras', () => {
    const onChange = jest.fn();
    render(
      <Editor
        inicial={[
          { materialId: 'm-cal', quantidade: '20' },
          { materialId: 'm-gesso', quantidade: '8' },
        ]}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getAllByLabelText('Quantidade')[1], { target: { value: '12.5' } });

    expect(ultimoOnChange(onChange)).toEqual([
      { materialId: 'm-cal', quantidade: '20' },
      { materialId: 'm-gesso', quantidade: '12.5' },
    ]);
  });

  it('remove a linha escolhida e mantém as outras', () => {
    const onChange = jest.fn();
    render(
      <Editor
        inicial={[
          { materialId: 'm-cal', quantidade: '20' },
          { materialId: 'm-gesso', quantidade: '8' },
        ]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Remover material' })[0]);

    expect(ultimoOnChange(onChange)).toEqual([{ materialId: 'm-gesso', quantidade: '8' }]);
    expect(screen.getAllByLabelText('Material')).toHaveLength(1);
    expect(screen.getByLabelText('Material')).toHaveValue('m-gesso');
    expect(screen.getByLabelText('Quantidade')).toHaveValue(8);
  });

  it('material já escolhido numa linha some das opções das outras linhas (EAP-40)', () => {
    const onChange = jest.fn();
    render(<Editor onChange={onChange} />);

    adicionar();
    const [primeira] = screen.getAllByLabelText('Material');
    expect(opcoes(primeira)).toEqual(['m-cal', 'm-gesso', 'm-placa']);
    fireEvent.change(primeira, { target: { value: 'm-cal' } });

    adicionar();
    const segunda = screen.getAllByLabelText('Material')[1];
    expect(opcoes(segunda)).toEqual(['m-gesso', 'm-placa']);
    fireEvent.change(segunda, { target: { value: 'm-gesso' } });

    // A primeira linha continua com a própria escolha, mas perde a da segunda.
    expect(opcoes(screen.getAllByLabelText('Material')[0])).toEqual(['m-cal', 'm-placa']);
  });

  it('só aceita material da lista carregada da API, sem texto livre', () => {
    const onChange = jest.fn();
    render(<Editor onChange={onChange} />);

    adicionar();
    const material = screen.getByLabelText('Material');
    expect(material.tagName).toBe('SELECT');
    expect(opcoes(material)).toEqual(['m-cal', 'm-gesso', 'm-placa']);

    // Um id fora da lista não tem opção: o select não o aceita e nada inexistente é entregue.
    fireEvent.change(material, { target: { value: 'm-fantasma' } });
    expect(onChange.mock.calls.flat(2)).not.toContainEqual(
      expect.objectContaining({ materialId: 'm-fantasma' }),
    );
    expect(material).not.toHaveValue('m-fantasma');
  });

  it('paraItensPrevistos envia a quantidade digitada como número', () => {
    expect(
      paraItensPrevistos([
        { materialId: 'm-cal', quantidade: '20' },
        { materialId: 'm-gesso', quantidade: '12.5' },
      ]),
    ).toEqual([
      { materialId: 'm-cal', quantidade: 20 },
      { materialId: 'm-gesso', quantidade: 12.5 },
    ]);
  });
});
