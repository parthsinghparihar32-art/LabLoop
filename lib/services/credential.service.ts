import { createAdminClient } from '@/lib/supabase/admin';
import type { Credential } from '@/lib/types/models';
import { NotFoundError, AuthorizationError, ValidationError } from '@/lib/types/api';
import { AuditService } from './audit.service';

export class CredentialService {
  /**
   * Retrieves credentials belonging to a user.
   */
  static async getUserCredentials(userId: string): Promise<Credential[]> {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('credentials')
      .select('*, verifier:profiles!verified_by(full_name, role)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch credentials: ${error.message}`);
    }

    return (data || []) as unknown as Credential[];
  }

  /**
   * Submits a new credential record for verification.
   */
  static async submitCredential(
    userId: string,
    data: {
      credential_type: string;
      document_url?: string | null;
      verification_notes?: string;
    }
  ): Promise<Credential> {
    const admin = createAdminClient();

    const { data: credential, error } = await admin
      .from('credentials')
      .insert({
        user_id: userId,
        credential_type: data.credential_type,
        document_url: data.document_url || null,
        verification_notes: data.verification_notes || null,
        verification_status: 'pending',
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to submit credential: ${error.message}`);
    }

    await AuditService.logEvent({
      actorId: userId,
      action: 'credential.submitted',
      entityType: 'credentials',
      entityId: credential.id,
      metadata: {
        credential_type: data.credential_type,
      },
    });

    return credential as Credential;
  }

  /**
   * Verifies or rejects a credential.
   * Enforces that verifier CANNOT be the owner of the credential (anti-self-verification).
   */
  static async verifyCredential(
    credentialId: string,
    verifierId: string,
    decision: {
      verification_status: 'verified' | 'rejected';
      verification_notes?: string;
      expires_at?: string | null;
    }
  ): Promise<Credential> {
    const admin = createAdminClient();

    // 1. Fetch current credential record
    const { data: current, error: fetchError } = await admin
      .from('credentials')
      .select('*')
      .eq('id', credentialId)
      .single();

    if (fetchError || !current) {
      throw new NotFoundError('Credential');
    }

    // 2. Anti-self-verification check
    if (current.user_id === verifierId) {
      throw new AuthorizationError('Self-verification is strictly prohibited. An independent verifier must review.');
    }

    // 3. Update credential record
    const { data: updated, error: updateError } = await admin
      .from('credentials')
      .update({
        verification_status: decision.verification_status,
        verified_by: verifierId,
        verified_at: new Date().toISOString(),
        verification_notes: decision.verification_notes || current.verification_notes,
        expires_at: decision.expires_at || null,
      })
      .eq('id', credentialId)
      .select('*, user:profiles!user_id(full_name, role), verifier:profiles!verified_by(full_name, role)')
      .single();

    if (updateError) {
      throw new Error(`Failed to verify credential: ${updateError.message}`);
    }

    await AuditService.logEvent({
      actorId: verifierId,
      action: `credential.${decision.verification_status}`,
      entityType: 'credentials',
      entityId: credentialId,
      metadata: {
        user_id: current.user_id,
        credential_type: current.credential_type,
        expires_at: decision.expires_at,
      },
    });

    return updated as unknown as Credential;
  }

  /**
   * Checks whether a user possesses an active, verified credential for a given resource requirement.
   */
  static async checkEligibility(
    userId: string,
    requiredCredentialType: string,
    endTimeIso: string
  ): Promise<boolean> {
    const admin = createAdminClient();
    const endTime = new Date(endTimeIso).getTime();

    const { data: credentials, error } = await admin
      .from('credentials')
      .select('*')
      .eq('user_id', userId)
      .eq('credential_type', requiredCredentialType)
      .eq('verification_status', 'verified');

    if (error || !credentials || credentials.length === 0) {
      return false;
    }

    // Check if any verified credential has not expired by the end of the booking
    return credentials.some((cred) => {
      if (!cred.expires_at) return true; // Lifetime/non-expiring credential
      const expiry = new Date(cred.expires_at).getTime();
      return expiry > endTime;
    });
  }
}
