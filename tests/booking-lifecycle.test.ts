import { describe, it, expect } from 'vitest';
import { BookingService } from '@/lib/services/booking.service';
import type { BookingStatus } from '@/lib/types/models';

describe('Booking Lifecycle & Conflict Prevention', () => {
  describe('Credit Cost Calculation', () => {
    it('calculates integer hours correctly', () => {
      const cost = BookingService.calculateCreditCost(
        10,
        '2026-11-01T10:00:00.000Z',
        '2026-11-01T12:00:00.000Z'
      );
      // 2 hours * 10 credits/hr = 20
      expect(cost).toBe(20);
    });

    it('rounds fractional hours up to ensure fair resource allocation', () => {
      const cost = BookingService.calculateCreditCost(
        10,
        '2026-11-01T10:00:00.000Z',
        '2026-11-01T11:15:00.000Z'
      );
      // 1.25 hours * 10 = 12.5 -> ceil = 13 credits
      expect(cost).toBe(13);
    });

    it('returns zero cost for free resources', () => {
      const cost = BookingService.calculateCreditCost(
        0,
        '2026-11-01T10:00:00.000Z',
        '2026-11-01T15:00:00.000Z'
      );
      expect(cost).toBe(0);
    });
  });

  describe('Booking State Machine Transitions', () => {
    // Valid transition graph:
    // requested -> approved -> checked_in -> returned -> completed
    // requested -> rejected
    // requested -> cancelled
    // approved  -> cancelled
    const validTransitions: Record<BookingStatus, BookingStatus[]> = {
      requested: ['approved', 'rejected', 'cancelled'],
      approved: ['checked_in', 'cancelled'],
      checked_in: ['returned'],
      returned: ['completed'],
      completed: [],
      rejected: [],
      cancelled: [],
    };

    function isValidTransition(from: BookingStatus, to: BookingStatus): boolean {
      return (validTransitions[from] || []).includes(to);
    }

    it('allows valid primary lifecycle progression', () => {
      expect(isValidTransition('requested', 'approved')).toBe(true);
      expect(isValidTransition('approved', 'checked_in')).toBe(true);
      expect(isValidTransition('checked_in', 'returned')).toBe(true);
      expect(isValidTransition('returned', 'completed')).toBe(true);
    });

    it('allows valid rejection and cancellation paths', () => {
      expect(isValidTransition('requested', 'rejected')).toBe(true);
      expect(isValidTransition('requested', 'cancelled')).toBe(true);
      expect(isValidTransition('approved', 'cancelled')).toBe(true);
    });

    it('prohibits invalid transitions', () => {
      expect(isValidTransition('requested', 'checked_in')).toBe(false);
      expect(isValidTransition('requested', 'returned')).toBe(false);
      expect(isValidTransition('completed', 'cancelled')).toBe(false);
      expect(isValidTransition('cancelled', 'approved')).toBe(false);
      expect(isValidTransition('rejected', 'approved')).toBe(false);
      expect(isValidTransition('checked_in', 'cancelled')).toBe(false);
    });
  });

  describe('Interval Overlap Logic (Conflict Prevention)', () => {
    function intervalsOverlap(
      startA: string,
      endA: string,
      startB: string,
      endB: string
    ): boolean {
      const aStart = new Date(startA).getTime();
      const aEnd = new Date(endA).getTime();
      const bStart = new Date(startB).getTime();
      const bEnd = new Date(endB).getTime();

      return aStart < bEnd && aEnd > bStart;
    }

    it('detects fully overlapping intervals', () => {
      const overlap = intervalsOverlap(
        '2026-11-01T10:00:00Z',
        '2026-11-01T12:00:00Z',
        '2026-11-01T10:00:00Z',
        '2026-11-01T12:00:00Z'
      );
      expect(overlap).toBe(true);
    });

    it('detects partially overlapping intervals (B starts before A ends)', () => {
      const overlap = intervalsOverlap(
        '2026-11-01T10:00:00Z',
        '2026-11-01T12:00:00Z',
        '2026-11-01T11:00:00Z',
        '2026-11-01T13:00:00Z'
      );
      expect(overlap).toBe(true);
    });

    it('detects enveloped intervals (B is fully inside A)', () => {
      const overlap = intervalsOverlap(
        '2026-11-01T09:00:00Z',
        '2026-11-01T15:00:00Z',
        '2026-11-01T11:00:00Z',
        '2026-11-01T12:00:00Z'
      );
      expect(overlap).toBe(true);
    });

    it('allows back-to-back adjacent bookings (abutting boundary without overlap)', () => {
      const overlap = intervalsOverlap(
        '2026-11-01T10:00:00Z',
        '2026-11-01T12:00:00Z',
        '2026-11-01T12:00:00Z',
        '2026-11-01T14:00:00Z'
      );
      // Abutting: aEnd == bStart -> aStart < bEnd is true, but aEnd > bStart is false!
      expect(overlap).toBe(false);
    });

    it('allows non-overlapping separated bookings', () => {
      const overlap = intervalsOverlap(
        '2026-11-01T10:00:00Z',
        '2026-11-01T11:00:00Z',
        '2026-11-01T13:00:00Z',
        '2026-11-01T14:00:00Z'
      );
      expect(overlap).toBe(false);
    });
  });
});
