import { SetMetadata } from '@nestjs/common';
import { InternalRole } from '@alliance-hcm/shared';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: InternalRole[]) => SetMetadata(ROLES_KEY, roles);
