/** Valor de desenvolvimento. Esta no repositorio publico, entao nunca pode assinar token em producao. */
export const SEGREDO_PADRAO_DEV = 'troque-esse-segredo-em-producao';

/**
 * Segredo que assina e confere os tokens JWT (AuthModule e JwtStrategy usam o mesmo).
 *
 * Em producao (NODE_ENV=production, definido no Dockerfile) a API se recusa a subir sem um
 * JWT_SECRET proprio: com o valor padrao, que qualquer um le no GitHub, daria para assinar um
 * token valido e entrar sem senha. Fora de producao o padrao continua valendo, para o dev local
 * e os testes nao precisarem de configuracao.
 */
export function segredoJwt(env: NodeJS.ProcessEnv = process.env): string {
  const segredo = env.JWT_SECRET?.trim();
  if (segredo && segredo !== SEGREDO_PADRAO_DEV) {
    return segredo;
  }
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'JWT_SECRET ausente ou igual ao valor padrao do repositorio. ' +
        'Defina um segredo proprio nas variaveis de ambiente antes de subir em producao.',
    );
  }
  return SEGREDO_PADRAO_DEV;
}
