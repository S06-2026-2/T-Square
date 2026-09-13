import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marca uma rota como aberta (sem exigir token JWT). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
