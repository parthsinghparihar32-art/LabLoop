import { describe, it, expect } from 'vitest';
import { InsufficientCreditsError } from '@/lib/types/api';

describe('Credit Ledger Semantics & Invariants', () => {
  interface MockLedgerEntry {
    id: string;
    userId: string;
    amount: number;
    type: 'grant' | 'deduction' | 'refund' | 'adjustment';
    idempotencyKey: string;
  }

  class MockCreditEngine {
    private entries: MockLedgerEntry[] = [];

    getBalance(userId: string): number {
      return this.entries
        .filter((e) => e.userId === userId)
        .reduce((sum, e) => sum + e.amount, 0);
    }

    process(params: {
      userId: string;
      amount: number;
      type: 'grant' | 'deduction' | 'refund' | 'adjustment';
      idempotencyKey: string;
    }): string {
      // 1. Idempotency check: if key already exists, return existing ID without re-executing
      const existing = this.entries.find((e) => e.idempotencyKey === params.idempotencyKey);
      if (existing) {
        return existing.id;
      }

      // 2. Non-negative balance constraint for deductions
      if (params.amount < 0) {
        const balance = this.getBalance(params.userId);
        const required = Math.abs(params.amount);
        if (balance < required) {
          throw new InsufficientCreditsError(required, balance);
        }
      }

      const id = `entry-${this.entries.length + 1}`;
      this.entries.push({
        id,
        userId: params.userId,
        amount: params.amount,
        type: params.type,
        idempotencyKey: params.idempotencyKey,
      });

      return id;
    }
  }

  it('correctly calculates balance across grants, deductions, and refunds', () => {
    const engine = new MockCreditEngine();
    const userId = 'user-123';

    // Initial grant: 100 credits
    engine.process({
      userId,
      amount: 100,
      type: 'grant',
      idempotencyKey: 'grant-init',
    });
    expect(engine.getBalance(userId)).toBe(100);

    // Deduction: 30 credits spent on 3D printer
    engine.process({
      userId,
      amount: -30,
      type: 'deduction',
      idempotencyKey: 'deduct-booking-1',
    });
    expect(engine.getBalance(userId)).toBe(70);

    // Refund: 30 credits refunded on cancellation
    engine.process({
      userId,
      amount: 30,
      type: 'refund',
      idempotencyKey: 'refund-booking-1',
    });
    expect(engine.getBalance(userId)).toBe(100);
  });

  it('strictly prevents unauthorized negative balances on deductions', () => {
    const engine = new MockCreditEngine();
    const userId = 'user-poor';

    // User only has 10 credits
    engine.process({
      userId,
      amount: 10,
      type: 'grant',
      idempotencyKey: 'grant-poor',
    });

    // Attempting to deduct 50 credits must throw InsufficientCreditsError
    expect(() => {
      engine.process({
        userId,
        amount: -50,
        type: 'deduction',
        idempotencyKey: 'deduct-overspend',
      });
    }).toThrowError(InsufficientCreditsError);

    // Balance remains intact at 10
    expect(engine.getBalance(userId)).toBe(10);
  });

  it('enforces idempotency: retry with same key does not double-charge or double-grant', () => {
    const engine = new MockCreditEngine();
    const userId = 'user-retry';

    // First grant
    const id1 = engine.process({
      userId,
      amount: 50,
      type: 'grant',
      idempotencyKey: 'unique-key-xyz',
    });

    // Replay/network retry with exact same idempotency key
    const id2 = engine.process({
      userId,
      amount: 50,
      type: 'grant',
      idempotencyKey: 'unique-key-xyz',
    });

    expect(id1).toBe(id2);
    // Balance is 50, NOT 100!
    expect(engine.getBalance(userId)).toBe(50);
  });
});
