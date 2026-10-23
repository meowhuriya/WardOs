import { AsyncLocalStorage } from 'node:async_hooks';
import { Role } from './types.js';

export interface RequestContext {
  staffId: string;
  staffName: string;
  role: Role;
  lastStepUpAt: number;
  originalText?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

export function requireRole(allowedRoles: Role[]): Role {
  const ctx = getContext();
  if (!ctx) {
    throw new Error('Authentication required: No active session context');
  }
  if (!allowedRoles.includes(ctx.role)) {
    throw new Error(`Permission denied: Action not permitted for role '${ctx.role}'. Required: ${allowedRoles.join(' or ')}`);
  }
  return ctx.role;
}

export function requireStepUp(maxAgeSeconds: number = 60): void {
  const ctx = getContext();
  if (!ctx) {
    throw new Error('Authentication required: No active session context');
  }
  const age = Date.now() - (ctx.lastStepUpAt || 0);
  if (age > maxAgeSeconds * 1000) {
    throw new Error('Step-up confirmation required: Please re-enter your PIN on screen to authorize this sensitive action');
  }
}
