import { afterEach, describe, expect, it, vi } from 'vitest';

import { getBreakGlassEmails, isBreakGlassEmail, isBreakGlassSigninEnabled } from './auth';

describe('break-glass password signin allowlist', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns an empty allowlist when the env var is unset or blank', () => {
    expect(getBreakGlassEmails()).toEqual([]);
    expect(isBreakGlassSigninEnabled()).toBe(false);

    vi.stubEnv('NEXT_PRIVATE_BREAK_GLASS_EMAILS', '');

    expect(getBreakGlassEmails()).toEqual([]);
    expect(isBreakGlassSigninEnabled()).toBe(false);
  });

  it('parses comma-separated emails with surrounding whitespace and mixed case', () => {
    vi.stubEnv('NEXT_PRIVATE_BREAK_GLASS_EMAILS', ' Joy@Dos.AI , admin@crove.com ,, ');

    expect(getBreakGlassEmails()).toEqual(['joy@dos.ai', 'admin@crove.com']);
    expect(isBreakGlassSigninEnabled()).toBe(true);
  });

  it('matches allowlisted emails case-insensitively and rejects everyone else', () => {
    vi.stubEnv('NEXT_PRIVATE_BREAK_GLASS_EMAILS', 'Joy@dos.ai');

    expect(isBreakGlassEmail('joy@dos.ai')).toBe(true);
    expect(isBreakGlassEmail('  JOY@DOS.AI  ')).toBe(true);
    expect(isBreakGlassEmail('admin@dos.ai')).toBe(false);
    expect(isBreakGlassEmail('')).toBe(false);
  });
});
