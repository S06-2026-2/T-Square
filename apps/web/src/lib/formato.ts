/** Helpers de formatacao usados nas telas. */

import type { AlertaEstoque, LinhaPrevistoUtilizado } from '../types';

export function moeda(valor: string | number | null | undefined): string {
  const numero = Number(valor ?? 0);
  return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function data(valor: string | null | undefined): string {
  if (!valor) return '-';
  return new Date(valor).toLocaleDateString('pt-BR');
}

/** Data e hora no fuso local, no formato `dd/mm/aaaa hh:mm`. */
export function dataHora(valor: string | null | undefined): string {
  if (!valor) return '-';
  const d = new Date(valor);
  const doisDigitos = (n: number) => String(n).padStart(2, '0');
  return (
    `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}/${d.getFullYear()} ` +
    `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`
  );
}

/**
 * Quantidade decimal da API (ex.: "1234.5") no formato brasileiro ("1.234,5").
 * Só troca a pontuação do texto: não converte para Number nem muda as casas decimais.
 */
export function numero(valor: string | number): string {
  const [inteiro, fracao] = String(valor).split('.');
  const sinal = inteiro.startsWith('-') ? '-' : '';
  const digitos = inteiro.replace('-', '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sinal}${digitos}${fracao ? `,${fracao}` : ''}`;
}

/** Parte inteira de um decimal em texto ("4.9" -> "4"), sem converter para Number. */
function parteInteira(valor: string): string {
  return valor.split('.')[0];
}

/**
 * Texto da situação de um alerta do agente de estoque (EAP-28), a partir do `motivo` que a API
 * já devolve calculado. Não compara nem converte números: só escolhe o texto.
 * N = parte inteira de diasAteMinimo: 0 -> "hoje", 1 -> "~1 dia", 2+ -> "~N dias".
 */
export function situacaoAlerta(alerta: Pick<AlertaEstoque, 'tipo' | 'motivo' | 'diasAteMinimo'>): string {
  if (alerta.tipo === 'INFORMATIVO') return 'observação do agente';
  if (alerta.motivo === 'ABAIXO_DO_MINIMO') return 'abaixo do mínimo';
  if (alerta.motivo === 'NO_MINIMO_COM_CONSUMO') return 'no mínimo';
  if (alerta.motivo === 'PREVISAO' && alerta.diasAteMinimo !== null) {
    const n = parteInteira(alerta.diasAteMinimo);
    if (n === '0') return 'cruza o mínimo hoje';
    if (n === '1') return 'cruza o mínimo em ~1 dia';
    return `cruza o mínimo em ~${n} dias`;
  }
  return 'sem consumo recente';
}

/** Diz se um decimal em texto é zero ("0", "0.00", "-0"), só olhando os dígitos. */
function ehZero(valor: string): boolean {
  return /^[-+]?0*(\.0*)?$/.test(valor) && /\d/.test(valor);
}

/**
 * Situação de uma linha do previsto x utilizado (EAP-56), a partir do pendente e do excedente
 * que a API já devolve calculados. A API garante os dois >= 0 (pendente e excedente com piso 0),
 * então "> 0" equivale a "diferente de zero", conferido no texto, sem converter nem fazer contas.
 */
export function situacaoPrevisto(linha: Pick<LinhaPrevistoUtilizado, 'pendente' | 'excedente'>): string {
  if (!ehZero(linha.pendente)) return `${numero(linha.pendente)} pendentes`;
  if (!ehZero(linha.excedente)) return `+${numero(linha.excedente)} além do previsto`;
  return 'conforme previsto';
}

/** Ate duas iniciais do nome, para o avatar ("Maria Silva" -> "MS"). */
export function iniciais(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0].toUpperCase())
    .join('');
}
