import { useEffect, useRef, useState } from 'react';

import { useInstalacao } from '../lib/instalacao';
import Icone from './Icone';

const INSTRUCAO_IOS = 'Toque em Compartilhar e depois em Adicionar à Tela de Início';

/**
 * "Instalar app" no topo (celular) e na área do usuário da sidebar (desktop).
 * - `'prompt'`: abre o diálogo de instalação do navegador (PWA-05, PWA-06).
 * - `'ios'`: o Safari do iPhone não tem esse diálogo; abre a instrução manual (PWA-10).
 * - `null`: não aparece (PWA-07, PWA-08, PWA-09).
 */
export default function BotaoInstalar() {
  const { modo, instalar } = useInstalacao();
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Instrução aberta: Esc ou toque fora fecha.
  useEffect(() => {
    if (!aberto) return;
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') setAberto(false);
    }
    function aoTocarFora(evento: Event) {
      if (!ref.current?.contains(evento.target as Node)) setAberto(false);
    }
    document.addEventListener('keydown', aoTeclar);
    document.addEventListener('pointerdown', aoTocarFora);
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.removeEventListener('pointerdown', aoTocarFora);
    };
  }, [aberto]);

  if (modo === null) return null;

  const ios = modo === 'ios';

  return (
    <div className="instalar" ref={ref}>
      <button
        type="button"
        className="btn-instalar"
        title="Instalar app"
        aria-expanded={ios ? aberto : undefined}
        aria-controls={ios ? 'instrucao-instalar' : undefined}
        onClick={() => (ios ? setAberto((atual) => !atual) : void instalar())}
      >
        <Icone nome="instalar" />
        <span>Instalar app</span>
      </button>

      {ios && aberto && (
        <div
          id="instrucao-instalar"
          className="painel-instalar"
          role="region"
          aria-label="Como instalar o app"
        >
          <p>{INSTRUCAO_IOS}</p>
        </div>
      )}
    </div>
  );
}
