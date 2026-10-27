import { OrigemTextoAlerta } from '@prisma/client';

import { finalizarJustificativa, MapaMarcadores } from './marcadores-obra';

/**
 * Cobre EAP-11, EAP-12, EAP-13 e EAP-61 de
 * .claude/specs/features/estoque-agente-proativo/spec.md
 */
describe('marcadores-obra', () => {
  const PADRAO = 'Saldo livre abaixo do mínimo.';

  describe('MapaMarcadores', () => {
    it('numera as obras na ordem em que aparecem, sem expor o titulo', () => {
      const mapa = new MapaMarcadores();

      expect(mapa.marcar('obra-a', 'Forro Residencia Silva')).toBe('{{OBRA_1}}');
      expect(mapa.marcar('obra-b', 'Sanca Loja Centro')).toBe('{{OBRA_2}}');
    });

    it('a mesma obra recebe sempre o mesmo marcador', () => {
      const mapa = new MapaMarcadores();
      mapa.marcar('obra-a', 'Forro Residencia Silva');
      mapa.marcar('obra-b', 'Sanca Loja Centro');

      expect(mapa.marcar('obra-a', 'Forro Residencia Silva')).toBe('{{OBRA_1}}');
      expect(mapa.marcar('obra-c', 'Drywall Escritorio')).toBe('{{OBRA_3}}');
    });

    it('titulo() devolve o titulo de um marcador emitido e undefined para os outros', () => {
      const mapa = new MapaMarcadores();
      mapa.marcar('obra-a', 'Forro Residencia Silva');

      expect(mapa.titulo('{{OBRA_1}}')).toBe('Forro Residencia Silva');
      expect(mapa.titulo('{{OBRA_2}}')).toBeUndefined();
    });

    it('paraJson() devolve marcador -> obraId', () => {
      const mapa = new MapaMarcadores();
      mapa.marcar('obra-a', 'Forro Residencia Silva');
      mapa.marcar('obra-b', 'Sanca Loja Centro');

      expect(mapa.paraJson()).toEqual({ '{{OBRA_1}}': 'obra-a', '{{OBRA_2}}': 'obra-b' });
    });
  });

  describe('finalizarJustificativa', () => {
    let mapa: MapaMarcadores;
    const silva = { obraId: 'obra-a', titulo: 'Forro Residencia Silva' };
    const loja = { obraId: 'obra-b', titulo: 'Sanca Loja Centro' };

    beforeEach(() => {
      mapa = new MapaMarcadores();
      mapa.marcar(silva.obraId, silva.titulo);
      mapa.marcar(loja.obraId, loja.titulo);
    });

    it('troca cada marcador emitido pelo titulo da obra (AGENTE)', () => {
      const r = finalizarJustificativa(
        'Reservar para {{OBRA_1}} e {{OBRA_2}}; {{OBRA_1}} começa amanhã.',
        mapa,
        [silva, loja],
        PADRAO,
      );

      expect(r).toEqual({
        texto:
          'Reservar para Forro Residencia Silva e Sanca Loja Centro; Forro Residencia Silva começa amanhã.',
        origemTexto: OrigemTextoAlerta.AGENTE,
      });
    });

    it('marcador alterado ({{OBRA 12}}) descarta o texto e usa o padrao (PADRAO)', () => {
      const r = finalizarJustificativa('Falta para {{OBRA 12}}.', mapa, [silva], PADRAO);

      expect(r).toEqual({ texto: PADRAO, origemTexto: OrigemTextoAlerta.PADRAO });
    });

    it('marcador bem formado mas nao emitido ({{OBRA_99}}) descarta o texto (PADRAO)', () => {
      const r = finalizarJustificativa(
        'Reservar para {{OBRA_1}} e {{OBRA_99}}.',
        mapa,
        [silva],
        PADRAO,
      );

      expect(r).toEqual({ texto: PADRAO, origemTexto: OrigemTextoAlerta.PADRAO });
    });

    it('sem marcador das obras que reservam: mantem o texto e acrescenta "Reservado para: A, B"', () => {
      const r = finalizarJustificativa('Consumo acelerou na última semana.', mapa, [silva, loja], PADRAO);

      expect(r).toEqual({
        texto:
          'Consumo acelerou na última semana. Reservado para: Forro Residencia Silva, Sanca Loja Centro.',
        origemTexto: OrigemTextoAlerta.AGENTE,
      });
    });

    it('texto do agente sem ponto final: acrescenta ". " antes de "Reservado para:"', () => {
      const r = finalizarJustificativa('Consumo acelerou na última semana', mapa, [silva, loja], PADRAO);

      expect(r).toEqual({
        texto:
          'Consumo acelerou na última semana. Reservado para: Forro Residencia Silva, Sanca Loja Centro.',
        origemTexto: OrigemTextoAlerta.AGENTE,
      });
    });

    it('cita outra obra mas nenhuma das que reservam: tambem acrescenta "Reservado para:"', () => {
      const r = finalizarJustificativa('{{OBRA_2}} passou do previsto.', mapa, [silva], PADRAO);

      expect(r).toEqual({
        texto: 'Sanca Loja Centro passou do previsto. Reservado para: Forro Residencia Silva.',
        origemTexto: OrigemTextoAlerta.AGENTE,
      });
    });

    it('cita ao menos uma das obras que reservam: nao acrescenta nada', () => {
      const r = finalizarJustificativa('Reservar para {{OBRA_2}}.', mapa, [silva, loja], PADRAO);

      expect(r).toEqual({
        texto: 'Reservar para Sanca Loja Centro.',
        origemTexto: OrigemTextoAlerta.AGENTE,
      });
    });

    it('sem marcador e sem obras que reservam: mantem o texto como esta', () => {
      const r = finalizarJustificativa('Consumo estável.', mapa, [], PADRAO);

      expect(r).toEqual({ texto: 'Consumo estável.', origemTexto: OrigemTextoAlerta.AGENTE });
    });
  });
});
