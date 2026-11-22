import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUserProfile } from '@alliance-hcm/shared';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUserProfile | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUserProfile }>();
    return request.user;
  },
);
