import { DIAS_NO_ARQUIVO, numero } from './formato';
import type { Material } from '../types';

const RESTAURAVEL = `é apagado de vez em ${DIAS_NO_ARQUIVO} dias; até lá dá para restaurar em "Ver arquivados".`;

/** Texto do botão desabilitado quando o gesseiro ainda tem saldo (ARQ-10 AC5). */
export const ZERE_O_SALDO = 'Zere o saldo para arquivar';

/** Confirmação do "Arquivar gesseiro" (ARQ-10). */
export function confirmacaoArquivarGesseiro(nome: string): string {
  return `Arquivar ${nome}? Ele some da lista e ${RESTAURAVEL}`;
}

/** Confirmação do "Arquivar" do material; avisa o saldo quando não é 0 (ARQ-12 AC5). */
export function confirmacaoArquivarMaterial(
  material: Pick<Material, 'nome' | 'unidade' | 'saldoAtual'>,
): string {
  const saldo = Number(material.saldoAtual);
  const aviso =
    saldo !== 0 ? ` Ainda há ${numero(String(saldo))} ${material.unidade} em estoque.` : '';
  return `Arquivar ${material.nome}?${aviso} Ele some do estoque e ${RESTAURAVEL}`;
}

/** Falha de rede: status 0 no ApiError do `lib/api.ts` (sem `instanceof`, como o useEnvio). */
export const ehFalhaDeRede = (e: unknown) => (e as { status?: unknown } | null)?.status === 0;

export const mensagemDe = (e: unknown) =>
  e instanceof Error ? e.message : 'Erro ao comunicar com a API';
