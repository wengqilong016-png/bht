/**
 * localStorage persistence layer for the auth state machine.
 * Extracted from useAuthBootstrap to keep the auth state machine clean.
 */

import type { User } from '../types';

const CACHED_USER_KEY = 'bht-cached-user';

function isValidCachedUser(obj: unknown): obj is User {
  if (!obj || typeof obj !== 'object') return false;
  const u = obj as Record<string, unknown>;
  return (
    typeof u.id === 'string' && u.id.length > 0 &&
    typeof u.username === 'string' &&
    (u.role === 'admin' || u.role === 'driver') &&
    typeof u.name === 'string'
  );
}

export function writeCachedUser(user: User): void {
  try {
    localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user));
  } catch {
    // localStorage may be unavailable in some environments — fail silently.
  }
}

export function readCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(CACHED_USER_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidCachedUser(parsed)) {
      clearCachedUser();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearCachedUser(): void {
  try {
    localStorage.removeItem(CACHED_USER_KEY);
  } catch {
    // fail silently
  }
}

/** Returns the default UI language for a given role. */
export function defaultLangForRole(role: 'admin' | 'driver'): 'zh' | 'sw' {
  return role === 'admin' ? 'zh' : 'sw';
}
