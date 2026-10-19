export type StatusObra = 'ORCAMENTO' | 'FECHADA' | 'ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA';

export type FormaPagamento =
  'PIX' | 'DINHEIRO' | 'CARTAO_CREDITO' | 'CARTAO_DEBITO' | 'BOLETO' | 'TRANSFERENCIA';

export type TipoLancamento = 'CREDITO' | 'VALE' | 'PAGAMENTO';

export interface Gesseiro {
  id: string;
  nome: string;
  telefone?: string | null;
  chavePix?: string | null;
  ativo: boolean;
}

export interface Pagamento {
  id: string;
  forma: FormaPagamento;
  parcelas: number;
  valorEntrada: string | number;
  observacao?: string | null;
}

export interface AlocacaoGesseiro {
  id: string;
  gesseiroId: string;
  valorCombinado: string | number;
  funcao?: string | null;
  gesseiro?: Gesseiro;
}

export interface Obra {
  id: string;
  titulo: string;
  descricao?: string | null;
  clienteNome: string;
  clienteTelefone?: string | null;
  endereco?: string | null;
  status: StatusObra;
  valorTotal: string | number;
  plantaBaixaUrl?: string | null;
  dataInicio?: string | null;
  dataConclusao?: string | null;
  pagamento?: Pagamento | null;
  gesseiros?: AlocacaoGesseiro[];
}

/** Linha de GET /obras/resumo; status sem obra nenhuma nao vem na resposta. */
export interface ResumoStatus {
  status: StatusObra;
  quantidade: number;
  valorTotal: string | number;
}

export interface Lancamento {
  id: string;
  tipo: TipoLancamento;
  valor: string | number;
  descricao?: string | null;
  criadoEm: string;
  obra?: { id: string; titulo: string } | null;
}

export interface Extrato {
  gesseiro: { id: string; nome: string };
  creditos: number;
  vales: number;
  pagamentos: number;
  saldoAReceber: number;
  lancamentos: Lancamento[];
}

export interface Material {
  id: string;
  nome: string;
  unidade: string;
  saldoAtual: string | number;
  estoqueMinimo: string | number;
}

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  papel: string;
}

export interface LoginResponse {
  accessToken: string;
  usuario: Usuario;
}
