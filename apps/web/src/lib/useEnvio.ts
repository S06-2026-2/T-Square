import { useState } from 'react';

/**
 * Estado de submit compartilhado pelos formularios.
 * Desabilita o botao durante o envio e guarda a mensagem de erro da API
 * sem mexer nos campos: quem chama so limpa o formulario quando recebe true.
 */
export function useEnvio() {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(fn: () => Promise<void>): Promise<boolean> {
    setErro(null);
    setEnviando(true);
    try {
      await fn();
      return true;
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao salvar');
      return false;
    } finally {
      setEnviando(false);
    }
  }

  return { enviando, erro, enviar };
}
