import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
  validate: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({
  prisma: {
    rateLimit: {
      findUnique: mocks.findUnique,
      upsert: mocks.upsert,
      deleteMany: mocks.deleteMany,
    },
  },
}));

vi.mock('../2fa/email/validate-2fa-token-from-email', () => ({
  validateTwoFactorTokenFromEmail: mocks.validate,
}));

vi.mock('@simplewebauthn/server', () => ({
  verifyAuthenticationResponse: vi.fn(),
}));

vi.mock('../../utils/authenticator', () => ({
  getAuthenticatorOptions: vi.fn(() => ({ rpName: 'test', rpId: 'test', origin: 'https://test' })),
}));

import { AppError, AppErrorCode } from '../../errors/app-error';
import { validateEmailOtpWithLockout } from './is-recipient-authorized';

const recipient = { envelopeId: 'env_1', email: 'Signer@Example.com' };

describe('validateEmailOtpWithLockout (M10/C3 recipient OTP lockout)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(null);
    mocks.deleteMany.mockResolvedValue({ count: 0 });
  });

  it('records a failed attempt against a case-insensitive per-envelope key', async () => {
    mocks.validate.mockResolvedValue(false);

    await expect(validateEmailOtpWithLockout(recipient, '000000')).resolves.toBe(false);

    expect(mocks.upsert).toHaveBeenCalledOnce();

    const upsertArg = mocks.upsert.mock.calls[0][0] as { where: { key_action_bucket: { key: string; action: string } } };
    expect(upsertArg.where.key_action_bucket.key).toBe('otp-fail:env_1:signer@example.com');
    expect(upsertArg.where.key_action_bucket.action).toBe('auth.recipient-email-otp');
  });

  it('throws TOO_MANY_REQUESTS once the attempt limit is reached', async () => {
    mocks.findUnique.mockResolvedValue({ count: 5 });

    let caught: unknown;

    try {
      await validateEmailOtpWithLockout(recipient, '000000');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).code).toBe(AppErrorCode.TOO_MANY_REQUESTS);

    // The code itself must never be checked once the recipient is locked out.
    expect(mocks.validate).not.toHaveBeenCalled();
  });

  it('resets the failure counter after a successful validation', async () => {
    mocks.validate.mockResolvedValue(true);

    await expect(validateEmailOtpWithLockout(recipient, '123456')).resolves.toBe(true);

    expect(mocks.deleteMany).toHaveBeenCalledOnce();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
