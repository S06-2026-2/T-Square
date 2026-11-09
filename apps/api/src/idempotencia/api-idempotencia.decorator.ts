import { ApiHeader } from '@nestjs/swagger';

/** Documenta no Swagger o cabecalho opcional das rotas de criacao. */
export const ApiIdempotencia = () =>
  ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'UUID; reenvio com a mesma chave devolve a resposta original',
  });
