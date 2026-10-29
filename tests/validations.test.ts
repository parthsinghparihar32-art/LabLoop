import { describe, it, expect } from 'vitest';
import {
  createResourceSchema,
  createBookingSchema,
  grantCreditSchema,
  verifyCredentialSchema,
  createConditionReportSchema,
  createIncidentSchema,
} from '@/lib/validations';

describe('Validation Schemas', () => {
  describe('Resource Validation', () => {
    it('accepts valid resource input', () => {
      const valid = {
        name: 'Stereomicroscope 40x',
        category: 'equipment',
        description: 'High magnification optical stereo microscope for micro-soldering and biology.',
        location: 'Lab 201',
        credit_rate: 15,
        status: 'available',
      };
      const result = createResourceSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejects negative credit rates', () => {
      const invalid = {
        name: 'Invalid Resource',
        category: 'equipment',
        description: 'Valid description with sufficient length.',
        location: 'Room 10',
        credit_rate: -5,
      };
      const result = createResourceSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.credit_rate).toBeDefined();
      }
    });

    it('rejects invalid resource category', () => {
      const invalid = {
        name: 'Invalid Category Resource',
        category: 'spaceship',
        description: 'Valid description with sufficient length.',
        location: 'Room 10',
        credit_rate: 10,
      };
      const result = createResourceSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('Booking Validation', () => {
    const validResourceId = '11111111-1111-1111-1111-111111111111';

    it('accepts valid time window where end_time > start_time', () => {
      const valid = {
        resource_id: validResourceId,
        start_time: '2026-11-01T10:00:00.000Z',
        end_time: '2026-11-01T12:00:00.000Z',
        purpose: 'Performing optical testing for capstone senior robotics project.',
      };
      const result = createBookingSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejects booking where end_time equals start_time', () => {
      const invalid = {
        resource_id: validResourceId,
        start_time: '2026-11-01T10:00:00.000Z',
        end_time: '2026-11-01T10:00:00.000Z',
        purpose: 'Zero duration booking attempt.',
      };
      const result = createBookingSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.end_time).toBeDefined();
      }
    });

    it('rejects booking where end_time is before start_time', () => {
      const invalid = {
        resource_id: validResourceId,
        start_time: '2026-11-01T12:00:00.000Z',
        end_time: '2026-11-01T10:00:00.000Z',
        purpose: 'Inverted time window booking attempt.',
      };
      const result = createBookingSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('rejects invalid UUID format for resource_id', () => {
      const invalid = {
        resource_id: 'not-a-valid-uuid',
        start_time: '2026-11-01T10:00:00.000Z',
        end_time: '2026-11-01T12:00:00.000Z',
        purpose: 'Valid purpose description here.',
      };
      const result = createBookingSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('Credit Grant Validation', () => {
    it('accepts valid credit grant with positive amount', () => {
      const valid = {
        user_id: '22222222-2222-2222-2222-222222222222',
        amount: 100,
        description: 'Semester allocation grant for researcher',
        idempotency_key: 'grant-sem-2026-user2',
      };
      const result = grantCreditSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejects negative or zero grant amount', () => {
      const invalid = {
        user_id: '22222222-2222-2222-2222-222222222222',
        amount: -50,
        description: 'Illegal negative grant',
        idempotency_key: 'grant-fail-key-001',
      };
      const result = grantCreditSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('Credential Verification Validation', () => {
    it('accepts valid verification decision', () => {
      const valid = {
        verification_status: 'verified',
        verification_notes: 'Passed cleanroom training exam and lab walk-through.',
        expires_at: '2027-11-01T00:00:00.000Z',
      };
      const result = verifyCredentialSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejects invalid verification status', () => {
      const invalid = {
        verification_status: 'pending', // Only 'verified' | 'rejected' allowed in decision
      };
      const result = verifyCredentialSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('Condition and Incident Validation', () => {
    it('validates condition report payload', () => {
      const valid = {
        resource_id: '11111111-1111-1111-1111-111111111111',
        report_type: 'check_in',
        condition: 'good',
        notes: 'Tool calibrated and in clean state upon check-in.',
      };
      const result = createConditionReportSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('validates incident reporting payload', () => {
      const valid = {
        resource_id: '11111111-1111-1111-1111-111111111111',
        severity: 'high',
        description: 'Nozzle temperature sensor failing during print extrusion.',
      };
      const result = createIncidentSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });
  });
});
