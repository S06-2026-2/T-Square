import { OrigemAnaliseEstoque, StatusAnaliseEstoque } from '@prisma/client';

import { AnaliseParaRelatorio, renderizarRaciocinio } from './relatorio-raciocinio';

/**
 * Cobre a T26 (HTML do raciocinio para a apresentacao) de
 * .claude/specs/features/estoque-agente-proativo/tasks.md
 */
describe('renderizarRaciocinio', () => {
  // A obra completa existe no banco, mas o render so recebe o titulo.
  const obra = {
    id: 'obra-1',
    titulo: 'Drywall - Clinica Bem Estar',
    clienteNome: 'Clinica Bem Estar Ltda',
    clienteTelefone: '(35) 98888-0003',
    endereco: 'Av. Brasil, 455 - Campos Gerais/MG',
  };
  const titulosObras = { [obra.id]: obra.titulo };

  function analise(sobrescrever: Partial<AnaliseParaRelatorio> = {}): AnaliseParaRelatorio {
    return {
      id: 'analise-1',
      origem: OrigemAnaliseEstoque.MANUAL,
      status: StatusAnaliseEstoque.SUCESSO,
      iniciadoEm: new Date('2026-10-28T09:00:00.000Z'),
      finalizadoEm: new Date('2026-10-28T09:00:40.000Z'),
      totalAlertas: 2,
      chamadasFerramenta: 2,
      modelo: 'claude-haiku-5-5',
      erro: null,
      passos: [
        { tipo: 'texto', texto: 'PASSO-A: vou listar os materiais.' },
        {
          tipo: 'ferramenta',
          ferramenta: 'reservadoPorObras',
          entrada: { materialId: 'mat-placa' },
          resultado: '{"obras":[{"obra":"{{OBRA_1}}","pendente":"60"}]}',
          erro: false,
        },
        {
          tipo: 'ferramenta',
          ferramenta: 'sugerirReposicao',
          entrada: { materialId: 'mat-placa', tipo: 'REPOSICAO', quantidade: 20 },
          resultado: 'PASSO-C',
          erro: true,
        },
        { tipo: 'texto', texto: 'PASSO-D: reservar placas para {{OBRA_1}}.' },
      ],
      marcadores: { '{{OBRA_1}}': obra.id },
      ...sobrescrever,
    };
  }

  const contar = (html: string, trecho: string) => html.split(trecho).length - 1;

  it('gera um bloco por passo, na ordem gravada', () => {
    const html = renderizarRaciocinio(analise(), titulosObras);

    expect(contar(html, 'class="passo ')).toBe(4);
    const posicoes = ['PASSO-A', 'reservadoPorObras', 'PASSO-C', 'PASSO-D'].map((t) =>
      html.indexOf(t),
    );
    expect(posicoes.every((p) => p >= 0)).toBe(true);
    expect(posicoes).toEqual([...posicoes].sort((a, b) => a - b));
  });

  it('mostra a ferramenta chamada, a entrada, o resultado e se ela foi recusada', () => {
    const html = renderizarRaciocinio(analise(), titulosObras);

    expect(html).toContain('sugerirReposicao');
    expect(html).toContain('&quot;quantidade&quot;: 20');
    expect(html).toContain('PASSO-C');
    expect(contar(html, 'class="passo ferramenta erro"')).toBe(1);
  });

  it('mostra a conclusao da analise: status, alertas ativos e chamadas', () => {
    const html = renderizarRaciocinio(
      analise({ status: StatusAnaliseEstoque.PARCIAL, totalAlertas: 3, chamadasFerramenta: 20 }),
      titulosObras,
    );

    expect(html).toContain('PARCIAL');
    expect(html).toMatch(/Alertas ativos<\/dt>\s*<dd>3<\/dd>/);
    expect(html).toMatch(/Chamadas de ferramenta<\/dt>\s*<dd>20<\/dd>/);
  });

  it('troca o marcador pelo titulo so na legenda; nos passos o marcador fica', () => {
    const html = renderizarRaciocinio(analise(), titulosObras);

    expect(contar(html, obra.titulo)).toBe(1);
    const legenda = html.slice(html.indexOf('id="legenda"'));
    expect(legenda).toContain(obra.titulo);
    expect(legenda).toContain('{{OBRA_1}}');
    expect(html).toContain('reservar placas para {{OBRA_1}}.');
  });

  it('nao traz clienteNome, telefone nem endereco da obra', () => {
    const html = renderizarRaciocinio(analise(), titulosObras);

    expect(html).not.toContain(obra.clienteNome);
    expect(html).not.toContain(obra.clienteTelefone);
    expect(html).not.toContain(obra.endereco);
  });

  it('e standalone: CSS inline e nenhum recurso externo', () => {
    const html = renderizarRaciocinio(analise(), titulosObras);

    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<style>');
    expect(html).not.toMatch(/<link|<script|src=|href=|@import|url\(|https?:\/\//i);
  });

  it('escapa HTML vindo do banco ou da LLM', () => {
    const html = renderizarRaciocinio(
      analise({
        passos: [{ tipo: 'texto', texto: '<script>alert("x")</script> & <b>' }],
        marcadores: { '{{OBRA_1}}': 'obra-x' },
      }),
      { 'obra-x': '<img src=x onerror=alert(1)>' },
    );

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &lt;b&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('analise sem passos (ex.: sem chave) gera o HTML com o aviso e o erro gravado', () => {
    const html = renderizarRaciocinio(
      analise({
        status: StatusAnaliseEstoque.FALHA,
        erro: 'sem chave',
        passos: [],
        marcadores: {},
      }),
      {},
    );

    expect(contar(html, 'class="passo ')).toBe(0);
    expect(html).toContain('Nenhum passo gravado');
    expect(html).toContain('sem chave');
    expect(html).toContain('Nenhuma obra citada');
  });

  it('marcador cuja obra nao existe mais aparece na legenda como obra nao encontrada', () => {
    const html = renderizarRaciocinio(analise({ marcadores: { '{{OBRA_1}}': 'apagada' } }), {});

    expect(html.slice(html.indexOf('id="legenda"'))).toContain('obra não encontrada');
  });
});
