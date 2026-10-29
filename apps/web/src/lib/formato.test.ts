import { dataHora, numero, situacaoAlerta, situacaoPrevisto } from './formato';

/**
 * ISO (UTC, como a API devolve) de um instante dado em hora local.
 * Assim o resultado esperado é fixo em qualquer fuso da máquina que roda o teste.
 */
function isoLocal(ano: number, mes: number, dia: number, hora: number, minuto: number): string {
  return new Date(ano, mes - 1, dia, hora, minuto).toISOString();
}

describe('dataHora (EAP-30)', () => {
  it('formata como dd/mm/aaaa hh:mm na hora local', () => {
    expect(dataHora(isoLocal(2026, 10, 28, 16, 45))).toBe('28/10/2026 16:45');
  });

  it('completa dia, mês, hora e minuto com zero à esquerda', () => {
    expect(dataHora(isoLocal(2026, 3, 4, 6, 7))).toBe('04/03/2026 06:07');
  });

  it('valor nulo ou vazio vira "-"', () => {
    expect(dataHora(null)).toBe('-');
    expect(dataHora(undefined)).toBe('-');
    expect(dataHora('')).toBe('-');
  });
});

describe('numero', () => {
  it('exibe o decimal da API com vírgula, sem mudar as casas', () => {
    expect(numero('10')).toBe('10');
    expect(numero('4.9')).toBe('4,9');
    expect(numero('12.50')).toBe('12,50');
  });

  it('separa milhares com ponto e mantém o sinal', () => {
    expect(numero('1234.5')).toBe('1.234,5');
    expect(numero('-1500')).toBe('-1.500');
  });
});

describe('situacaoAlerta (EAP-28)', () => {
  // O texto vem do motivo calculado na API; o front não compara nem converte números.
  const base = { tipo: 'REPOSICAO' as const, motivo: 'PREVISAO' as const, diasAteMinimo: '5' };

  it('ABAIXO_DO_MINIMO: "abaixo do mínimo"', () => {
    expect(situacaoAlerta({ ...base, motivo: 'ABAIXO_DO_MINIMO', diasAteMinimo: '0' })).toBe('abaixo do mínimo');
  });

  it('NO_MINIMO_COM_CONSUMO: "no mínimo"', () => {
    expect(situacaoAlerta({ ...base, motivo: 'NO_MINIMO_COM_CONSUMO', diasAteMinimo: '0' })).toBe('no mínimo');
  });

  it('PREVISAO com N = 0 (parte inteira de diasAteMinimo): "cruza o mínimo hoje"', () => {
    expect(situacaoAlerta({ ...base, diasAteMinimo: '0.5' })).toBe('cruza o mínimo hoje');
    expect(situacaoAlerta({ ...base, diasAteMinimo: '0' })).toBe('cruza o mínimo hoje');
  });

  it('PREVISAO com N = 1: "cruza o mínimo em ~1 dia" (singular)', () => {
    expect(situacaoAlerta({ ...base, diasAteMinimo: '1.99' })).toBe('cruza o mínimo em ~1 dia');
  });

  it('PREVISAO com N >= 2: "cruza o mínimo em ~N dias"', () => {
    expect(situacaoAlerta({ ...base, diasAteMinimo: '2' })).toBe('cruza o mínimo em ~2 dias');
    expect(situacaoAlerta({ ...base, diasAteMinimo: '4.9' })).toBe('cruza o mínimo em ~4 dias');
    expect(situacaoAlerta({ ...base, diasAteMinimo: '12.3' })).toBe('cruza o mínimo em ~12 dias');
  });

  it('REPOSICAO sem motivo (ritmo 0): "sem consumo recente"', () => {
    expect(situacaoAlerta({ ...base, motivo: null, diasAteMinimo: null })).toBe('sem consumo recente');
  });

  it('INFORMATIVO (motivo null): "observação do agente"', () => {
    expect(situacaoAlerta({ tipo: 'INFORMATIVO', motivo: null, diasAteMinimo: '30' })).toBe(
      'observação do agente',
    );
  });
});

describe('situacaoPrevisto (EAP-56)', () => {
  // Pendente e excedente vêm prontos da API; o front só escolhe o texto e formata.
  it('pendente > 0: "N pendentes"', () => {
    expect(situacaoPrevisto({ pendente: '12', excedente: '0' })).toBe('12 pendentes');
    expect(situacaoPrevisto({ pendente: '2.5', excedente: '0' })).toBe('2,5 pendentes');
  });

  it('excedente > 0: "+N além do previsto"', () => {
    expect(situacaoPrevisto({ pendente: '0', excedente: '5' })).toBe('+5 além do previsto');
    expect(situacaoPrevisto({ pendente: '0.00', excedente: '1250.5' })).toBe(
      '+1.250,5 além do previsto',
    );
  });

  it('os dois 0: "conforme previsto"', () => {
    expect(situacaoPrevisto({ pendente: '0', excedente: '0' })).toBe('conforme previsto');
    expect(situacaoPrevisto({ pendente: '0.00', excedente: '0.0' })).toBe('conforme previsto');
  });

  it('decimal só abaixo de 1 ainda conta como maior que zero', () => {
    expect(situacaoPrevisto({ pendente: '0.01', excedente: '0' })).toBe('0,01 pendentes');
    expect(situacaoPrevisto({ pendente: '0', excedente: '0.5' })).toBe('+0,5 além do previsto');
  });
});
