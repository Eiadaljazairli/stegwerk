import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { setRequestUser } from '../observability/request-context';
import { MembershipsService } from '../workspaces/memberships.service';
import { type RequestUser } from './decorators/current-user.decorator';

export type JwtPayload = {
  sub: string;
  email: string;
  workspaceId: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly membershipsService: MembershipsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('jwtSecret'),
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    const membership = await this.membershipsService.findOne(
      payload.sub,
      payload.workspaceId,
    );

    if (membership === null) {
      throw new UnauthorizedException(
        'Der Zugriff auf diesen Arbeitsbereich wurde entzogen',
      );
    }

    setRequestUser(payload.sub, payload.workspaceId);

    return {
      userId: payload.sub,
      workspaceId: payload.workspaceId,
      email: payload.email,
    };
  }
}
