/** Icones SVG de traco usados na interface. Sem biblioteca, so o necessario. */

const caminhos = {
  marca: ['M4 7.5 12 3l8 4.5-8 4.5z', 'M4 12l8 4.5 8-4.5', 'M4 16.5 12 21l8-4.5'],
  obras: ['M3 10.5 12 3l9 7.5', 'M5 9v11h14V9', 'M10 20v-6h4v6'],
  gesseiros: [
    'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
    'M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5',
    'M16 4.6a3.5 3.5 0 0 1 0 6.8',
    'M18 14.8c1.9.7 3.1 2.5 3.5 5.2',
  ],
  estoque: ['M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z', 'M3 7.5 12 12l9-4.5', 'M12 12v9'],
  sair: ['M13 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h7', 'M10 12h10', 'M16 8l4 4-4 4'],
  mais: ['M12 5v14', 'M5 12h14'],
  vazio: ['M4 7h16v12H4z', 'M4 7l2-3h12l2 3', 'M9 11h6'],
} as const;

export type NomeIcone = keyof typeof caminhos;

export default function Icone({ nome, tamanho = 18 }: { nome: NomeIcone; tamanho?: number }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {caminhos[nome].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
