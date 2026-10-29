import { describe, it, expect } from 'vitest';
import { AuthorizationError } from '@/lib/types/api';

describe('Credential Passport & Eligibility Verification', () => {
  interface MockCredential {
    userId: string;
    credentialType: string;
    verificationStatus: 'pending' | 'verified' | 'rejected' | 'expired';
    expiresAt?: string | null;
    verifiedBy?: string | null;
  }

  function checkEligibility(
    userCredentials: MockCredential[],
    requiredType: string | null | undefined,
    bookingEndTime: string
  ): boolean {
    if (!requiredType) return true; // Unrestricted resource

    const endTime = new Date(bookingEndTime).getTime();
    return userCredentials.some((cred) => {
      if (cred.credentialType !== requiredType) return false;
      if (cred.verificationStatus !== 'verified') return false;
      if (!cred.expiresAt) return true; // Lifetime credential
      return new Date(cred.expiresAt).getTime() > endTime;
    });
  }

  function verifyCredential(
    credential: MockCredential,
    verifierId: string,
    status: 'verified' | 'rejected'
  ) {
    // Anti-self-verification rule
    if (credential.userId === verifierId) {
      throw new AuthorizationError('Self-verification is prohibited.');
    }
    credential.verificationStatus = status;
    credential.verifiedBy = verifierId;
    return credential;
  }

  it('allows access to unrestricted resources without credentials', () => {
    const eligible = checkEligibility([], null, '2026-11-01T12:00:00Z');
    expect(eligible).toBe(true);
  });

  it('allows access when user possesses active verified credential', () => {
    const creds: MockCredential[] = [
      {
        userId: 'user-1',
        credentialType: 'cleanroom_access',
        verificationStatus: 'verified',
        expiresAt: '2027-01-01T00:00:00Z',
      },
    ];

    const eligible = checkEligibility(creds, 'cleanroom_access', '2026-11-01T12:00:00Z');
    expect(eligible).toBe(true);
  });

  it('denies access when credential has expired before booking end time', () => {
    const creds: MockCredential[] = [
      {
        userId: 'user-1',
        credentialType: 'cleanroom_access',
        verificationStatus: 'verified',
        expiresAt: '2026-10-01T00:00:00Z', // Expired
      },
    ];

    const eligible = checkEligibility(creds, 'cleanroom_access', '2026-11-01T12:00:00Z');
    expect(eligible).toBe(false);
  });

  it('denies access when credential is still in pending status', () => {
    const creds: MockCredential[] = [
      {
        userId: 'user-1',
        credentialType: 'cleanroom_access',
        verificationStatus: 'pending',
      },
    ];

    const eligible = checkEligibility(creds, 'cleanroom_access', '2026-11-01T12:00:00Z');
    expect(eligible).toBe(false);
  });

  it('prohibits self-verification attempts at validation layer', () => {
    const cred: MockCredential = {
      userId: 'student-charlie',
      credentialType: '3d_printer_certification',
      verificationStatus: 'pending',
    };

    expect(() => {
      verifyCredential(cred, 'student-charlie', 'verified');
    }).toThrowError(AuthorizationError);
  });

  it('permits authorized independent verifier to verify credentials', () => {
    const cred: MockCredential = {
      userId: 'student-charlie',
      credentialType: '3d_printer_certification',
      verificationStatus: 'pending',
    };

    const updated = verifyCredential(cred, 'verifier-prof-smith', 'verified');
    expect(updated.verificationStatus).toBe('verified');
    expect(updated.verifiedBy).toBe('verifier-prof-smith');
  });
});
