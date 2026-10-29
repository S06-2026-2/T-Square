import { Prisma } from '@prisma/client';

import {
  calcularIndicador,
  diasJanela,
  excedenteObra,
  pendenteObra,
  utilizadoObra,
} from './calculo-estoque';

/**
 * Cobre as formulas de .claude/specs/features/estoque-agente-proativo/spec.md
 * (Assumptions "Estoque comprometido", "Utilizado", "Janela", "Formulas", "Alerta obrigatorio").
 * Funcoes puras: nenhum mock.
 */
describe('calculo-estoque', () => {
  const dec = (valor: number | string) => new Prisma.Decimal(valor);
  const DIA = 24 * 60 * 60 * 1000;
  const agora = new Date('2026-10-27T12:00:00Z');

  describe('utilizadoObra', () => {
    it('e saidas menos entradas (devolucao abate o utilizado)', () => {
      expect(utilizadoObra(dec(8), dec(3)).toString()).toBe('5');
    });

    it('tem piso 0 quando as devolucoes passam das saidas', () => {
      expect(utilizadoObra(dec(4), dec(6)).toString()).toBe('0');
    });
  });

  describe('pendenteObra / excedenteObra', () => {
    it('pendente = previsto - utilizado e excedente 0 quando utilizado < previsto', () => {
      expect(pendenteObra(dec(20), dec(8)).toString()).toBe('12');
      expect(excedenteObra(dec(20), dec(8)).toString()).toBe('0');
    });

    it('utilizado acima do previsto: pendente 0 e excedente = utilizado - previsto', () => {
      expect(pendenteObra(dec(10), dec(15)).toString()).toBe('0');
      expect(excedenteObra(dec(10), dec(15)).toString()).toBe('5');
    });

    it('com utilizado 0 (piso das devolucoes) o pendente nunca passa do previsto', () => {
      const utilizado = utilizadoObra(dec(2), dec(5));
      expect(pendenteObra(dec(20), utilizado).toString()).toBe('20');
    });
  });

  describe('diasJanela', () => {
    it('material criado ha menos de 7 dias usa janela 7', () => {
      expect(diasJanela(new Date(agora.getTime() - 3 * DIA), agora)).toBe(7);
    });

    it('usa os dias inteiros desde a criacao entre 7 e 30', () => {
      expect(diasJanela(new Date(agora.getTime() - 12.9 * DIA), agora)).toBe(12);
    });

    it('material criado ha mais de 30 dias usa janela 30', () => {
      expect(diasJanela(new Date(agora.getTime() - 400 * DIA), agora)).toBe(30);
    });
  });

  describe('calcularIndicador', () => {
    it('aplica as formulas: reservado, saldo livre, ritmo, dias ate o minimo e sugerido', () => {
      // Independent Test (P1): 55 de SAIDA solta em 30 dias, saldo 15, minimo 10.
      const ind = calcularIndicador({
        saldoAtual: dec(15),
        estoqueMinimo: dec(10),
        pendentes: [],
        consumoSolto: dec(55),
        diasJanela: 30,
      });

      expect(ind.reservado.toString()).toBe('0');
      expect(ind.saldoLivre.toString()).toBe('15');
      expect(ind.ritmoDiario.toDecimalPlaces(4).toString()).toBe('1.8333');
      // (15 - 10) / (55/30) = 2,7272...
      expect(ind.diasAteMinimo?.toDecimalPlaces(4).toString()).toBe('2.7273');
      // ceil(55 + 10 - 15) = 50
      expect(ind.calculado.toString()).toBe('50');
      expect(ind.obrigatorio).toBe(false);
      // ritmo > 0 e diasAteMinimo <= 7: alerta de previsao (a criterio do agente)
      expect(ind.motivo).toBe('PREVISAO');
    });

    it('reservado e a soma dos pendentes e e descontado do saldo atual', () => {
      // Independent Test (P2): Cal saldo 25, minimo 10, obra FECHADA com 20 pendentes.
      const ind = calcularIndicador({
        saldoAtual: dec(25),
        estoqueMinimo: dec(10),
        pendentes: [dec(12), dec(8)],
        consumoSolto: dec(0),
        diasJanela: 30,
      });

      expect(ind.reservado.toString()).toBe('20');
      expect(ind.saldoLivre.toString()).toBe('5');
      expect(ind.obrigatorio).toBe(true);
      // ceil(0 + 10 - 5) = 5
      expect(ind.calculado.toString()).toBe('5');
    });

    it('calculado <= 0 quando o estoque cobre 30 dias de consumo (sem alerta obrigatorio)', () => {
      // Independent Test (P1): saldo 40, minimo 10, ritmo 1/dia => ceil(30 + 10 - 40) = 0.
      const ind = calcularIndicador({
        saldoAtual: dec(40),
        estoqueMinimo: dec(10),
        pendentes: [],
        consumoSolto: dec(30),
        diasJanela: 30,
      });

      expect(ind.ritmoDiario.toString()).toBe('1');
      expect(ind.diasAteMinimo?.toString()).toBe('30');
      expect(ind.calculado.toString()).toBe('0');
      expect(ind.obrigatorio).toBe(false);
      expect(ind.motivo).toBeNull();
    });

    it('saldo livre abaixo do minimo gera alerta obrigatorio mesmo sem consumo', () => {
      const ind = calcularIndicador({
        saldoAtual: dec(4),
        estoqueMinimo: dec(10),
        pendentes: [],
        consumoSolto: dec(0),
        diasJanela: 30,
      });

      expect(ind.obrigatorio).toBe(true);
      expect(ind.motivo).toBe('ABAIXO_DO_MINIMO');
      expect(ind.ritmoDiario.toString()).toBe('0');
      expect(ind.diasAteMinimo).toBeNull();
      // sem SAIDA solta: ceil(minimo - saldoLivre) = 6
      expect(ind.calculado.toString()).toBe('6');
    });

    it('saldo livre igual ao minimo com ritmo > 0 gera alerta com diasAteMinimo = 0', () => {
      const ind = calcularIndicador({
        saldoAtual: dec(10),
        estoqueMinimo: dec(10),
        pendentes: [],
        consumoSolto: dec(15),
        diasJanela: 30,
      });

      expect(ind.obrigatorio).toBe(true);
      expect(ind.motivo).toBe('NO_MINIMO_COM_CONSUMO');
      expect(ind.diasAteMinimo?.toString()).toBe('0');
      // ceil(0,5 * 30 + 10 - 10) = 15
      expect(ind.calculado.toString()).toBe('15');
    });

    it('saldo livre igual ao minimo com ritmo 0 nao gera alerta obrigatorio', () => {
      const ind = calcularIndicador({
        saldoAtual: dec(10),
        estoqueMinimo: dec(10),
        pendentes: [],
        consumoSolto: dec(0),
        diasJanela: 30,
      });

      expect(ind.obrigatorio).toBe(false);
      expect(ind.calculado.toString()).toBe('0');
    });

    it('minimo 0, reservado 0 e ritmo 0 nao gera alerta (inclusive com saldo 0)', () => {
      const ind = calcularIndicador({
        saldoAtual: dec(0),
        estoqueMinimo: dec(0),
        pendentes: [],
        consumoSolto: dec(0),
        diasJanela: 7,
      });

      expect(ind.saldoLivre.toString()).toBe('0');
      expect(ind.obrigatorio).toBe(false);
      expect(ind.calculado.toString()).toBe('0');
    });

    it('usa a janela recebida no ritmo (janela 7 para material novo)', () => {
      const ind = calcularIndicador({
        saldoAtual: dec(100),
        estoqueMinimo: dec(10),
        pendentes: [],
        consumoSolto: dec(14),
        diasJanela: 7,
      });

      expect(ind.ritmoDiario.toString()).toBe('2');
      // (100 - 10) / 2 = 45
      expect(ind.diasAteMinimo?.toString()).toBe('45');
    });

    it('saldo livre negativo (reservado > saldo atual) gera alerta com a formula C', () => {
      const ind = calcularIndicador({
        saldoAtual: dec(5),
        estoqueMinimo: dec(10),
        pendentes: [dec(20)],
        consumoSolto: dec(30),
        diasJanela: 30,
      });

      expect(ind.saldoLivre.toString()).toBe('-15');
      expect(ind.obrigatorio).toBe(true);
      expect(ind.motivo).toBe('ABAIXO_DO_MINIMO');
      // (-15 - 10) * 30 / 30 = -25 -> piso 0
      expect(ind.diasAteMinimo?.toString()).toBe('0');
      // ceil(1 * 30 + 10 - (-15)) = 55
      expect(ind.calculado.toString()).toBe('55');
    });

    it('ceil exato com decimais: 0,1 + 0,2 de reservado nao vira 1 unidade a mais', () => {
      // Em Number: 11 - (10.3 - (0.1 + 0.2)) = 1.0000000000000018 -> ceil 2 (errado).
      const ind = calcularIndicador({
        saldoAtual: dec('10.3'),
        estoqueMinimo: dec(11),
        pendentes: [dec('0.1'), dec('0.2')],
        consumoSolto: dec(0),
        diasJanela: 30,
      });

      expect(ind.saldoLivre.toString()).toBe('10');
      expect(ind.calculado.toString()).toBe('1');
    });

    it('ceil exato com ritmo periodico: 50 em 30 dias cobre exatamente 50', () => {
      // 50/30 = 1,666...67 (arredondado); x 30 daria 50,000...001 e o ceil daria 51.
      const ind = calcularIndicador({
        saldoAtual: dec(10),
        estoqueMinimo: dec(10),
        pendentes: [],
        consumoSolto: dec(50),
        diasJanela: 30,
      });

      expect(ind.calculado.toString()).toBe('50');
    });

    // EAP-69: PREVISAO quando cruza o mínimo em até 7 dias (diasAteMinimo <= 7), com ritmo > 0.
    it('cruza o mínimo em exatamente 7 dias: PREVISAO, sem ser obrigatório (EAP-69)', () => {
      // ritmo 1/dia; (17 - 10) x 30 / 30 = 7 dias
      const ind = calcularIndicador({
        saldoAtual: dec(17),
        estoqueMinimo: dec(10),
        pendentes: [],
        consumoSolto: dec(30),
        diasJanela: 30,
      });

      expect(ind.diasAteMinimo?.toString()).toBe('7');
      expect(ind.motivo).toBe('PREVISAO');
      expect(ind.obrigatorio).toBe(false);
    });

    it('cruza o mínimo depois de 7 dias: sem PREVISAO (EAP-69)', () => {
      // (17,01 - 10) x 30 / 30 = 7,01 dias
      const ind = calcularIndicador({
        saldoAtual: dec('17.01'),
        estoqueMinimo: dec(10),
        pendentes: [],
        consumoSolto: dec(30),
        diasJanela: 30,
      });

      expect(ind.diasAteMinimo?.toString()).toBe('7.01');
      expect(ind.motivo).toBeNull();
      expect(ind.obrigatorio).toBe(false);
    });
  });
});
