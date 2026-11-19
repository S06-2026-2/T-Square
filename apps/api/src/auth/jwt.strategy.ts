import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { segredoJwt } from './segredo-jwt';

export interface JwtPayload {
  sub: string;
  email: string;
  papel: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: segredoJwt(),
    });
  }

  /** O retorno daqui vira request.user nos controllers. */
  async validate(payload: JwtPayload) {
    return { id: payload.sub, email: payload.email, papel: payload.papel };
  }
}
