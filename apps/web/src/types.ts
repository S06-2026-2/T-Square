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

// ---------- agente de estoque ----------
// Os campos numéricos chegam como string (Decimal da API) e são só exibidos.

export type TipoAlertaEstoque = 'REPOSICAO' | 'INFORMATIVO';
export type StatusAlertaEstoque = 'ATIVO' | 'DISPENSADO' | 'RESOLVIDO';
export type OrigemTextoAlerta = 'AGENTE' | 'PADRAO';
export type StatusAnaliseEstoque = 'EM_ANDAMENTO' | 'SUCESSO' | 'PARCIAL' | 'FALHA';
export type OrigemAnaliseEstoque = 'AGENDADA' | 'CATCH_UP' | 'MANUAL';

/** Motivo do alerta, calculado na API a partir dos números gravados (null em INFORMATIVO ou sem consumo). */
export type MotivoAlertaEstoque = 'ABAIXO_DO_MINIMO' | 'NO_MINIMO_COM_CONSUMO' | 'PREVISAO';

export interface AlertaEstoque {
  id: string;
  materialId: string;
  tipo: TipoAlertaEstoque;
  status: StatusAlertaEstoque;
  /** null no INFORMATIVO. */
  quantidadeSugerida: string | null;
  saldoLivre: string;
  estoqueMinimo: string;
  ritmoDiario: string;
  /** null quando o ritmo de consumo é 0. */
  diasAteMinimo: string | null;
  justificativa: string;
  origemTexto: OrigemTextoAlerta;
  motivo: MotivoAlertaEstoque | null;
  criadoEm: string;
  material: Material;
}

export interface AnaliseEstoque {
  id: string;
  origem: OrigemAnaliseEstoque;
  status: StatusAnaliseEstoque;
  iniciadoEm: string;
  finalizadoEm: string | null;
  totalAlertas: number;
}

/** GET /estoque/agente/alertas: alertas ATIVO já na ordem de urgência. */
export interface RespostaAlertasEstoque {
  ultimaAnalise: AnaliseEstoque | null;
  alertas: AlertaEstoque[];
}

/** Item de GET /estoque/agente/silenciados, o que acaba primeiro no topo. */
export interface SilenciadoEstoque {
  alertaId: string;
  materialId: string;
  material: Pick<Material, 'nome' | 'unidade'>;
  /** Tipo do alerta que o operador fechou. */
  tipo: TipoAlertaEstoque;
  acao: Exclude<StatusAlertaEstoque, 'ATIVO'>;
  /** Quando foi dispensado/resolvido. */
  em: string;
  /** Quando o material volta a poder ser alertado. */
  ate: string;
  /** TUDO: nenhum alerta do material; INFORMATIVO: só novas observações ficam de fora. */
  abrangencia: 'TUDO' | 'INFORMATIVO';
}

/** Item enviado em POST /obras e PUT /obras/:id/materiais-previstos. */
export interface MaterialPrevistoItem {
  materialId: string;
  quantidade: number;
}

/** Linha de GET /obras/:id/materiais-previstos (previsto x utilizado). */
export interface LinhaPrevistoUtilizado {
  materialId: string;
  material: string;
  unidade: string;
  previsto: string;
  utilizado: string;
  pendente: string;
  excedente: string;
  /** Material que saiu para a obra sem estar previsto: previsto 0, todo o utilizado e excedente (EAP-70). */
  semPrevisao: boolean;
}
