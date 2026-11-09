/**
 * UUID v4 para a chave de idempotência (IDP-01).
 * `crypto.randomUUID` só existe em contexto seguro (HTTPS ou localhost); no celular pela rede
 * local (`http://192.168.x.x:5173`) ele falta, então o v4 é montado com `getRandomValues`.
 */
export function gerarUuid(): string {
  const cripto = typeof crypto === 'undefined' ? undefined : crypto;
  if (typeof cripto?.randomUUID === 'function') {
    return cripto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof cripto?.getRandomValues === 'function') {
    cripto.getRandomValues(bytes);
  } else {
    // Último recurso, sem Web Crypto nenhuma (o design não cobre esse caso): Math.random não é
    // criptográfico, mas a chave só precisa não repetir entre envios do mesmo usuário na mesma
    // rota em 24 h, e a API ainda valida o formato.
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40; // versão 4 no 13º dígito hex
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante 8, 9, a ou b no 17º dígito hex

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
