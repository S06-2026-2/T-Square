/**
 * Endereço da API. Fica fora do `api.ts` porque `import.meta` não compila no Jest (CommonJS):
 * os testes que carregam o `api.ts` de verdade mockam só este módulo.
 */
export const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
