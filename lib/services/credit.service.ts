import { createAdminClient } from '@/lib/supabase/admin';
import type { CreditLedgerEntry, CreditTransactionType } from '@/lib/types/models';
import { InsufficientCreditsError, ConflictError } from '@/lib/types/api';
import { AuditService } from './audit.service';

export class CreditService {
  /**
   * Calculates the current FairShare credit balance for a given user.
   */
  static async getBalance(userId: string): Promise<number> {
    const admin = createAdminClient();

    const { data, error } = await admin.rpc('get_credit_balance', {
      p_user_id: userId,
    });

    if (error) {
      // Fallback calculation directly from credit_ledger
      const { data: rows, error: fallbackError } = await admin
        .from('credit_ledger')
        .select('amount')
        .eq('user_id', userId);

      if (fallbackError) {
        throw new Error(`Failed to calculate balance: ${fallbackError.message}`);
      }

      return (rows || []).reduce((acc, row) => acc + (row.amount || 0), 0);
    }

    return Number(data) || 0;
  }

  /**
   * Retrieves paginated credit transaction history for a user.
   */
  static async getHistory(
    userId: string,
    page = 1,
    limit = 20
  ): Promise<{ entries: CreditLedgerEntry[]; total: number }> {
    const admin = createAdminClient();
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, count, error } = await admin
      .from('credit_ledger')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(`Failed to fetch credit history: ${error.message}`);
    }

    return {
      entries: (data || []) as CreditLedgerEntry[],
      total: count || 0,
    };
  }

  /**
   * Executes an atomic credit transaction with idempotency and non-negative balance enforcement.
   */
  static async processTransaction(params: {
    userId: string;
    bookingId?: string | null;
    amount: number;
    transactionType: CreditTransactionType;
    idempotencyKey: string;
    description: string;
  }): Promise<string> {
    const admin = createAdminClient();

    // 1. Check idempotency
    const { data: existing } = await admin
      .from('credit_ledger')
      .select('id')
      .eq('idempotency_key', params.idempotencyKey)
      .single();

    if (existing) {
      return existing.id;
    }

    // 2. If deduction, verify user balance before inserting
    if (params.amount < 0) {
      const currentBalance = await this.getBalance(params.userId);
      const required = Math.abs(params.amount);
      if (currentBalance < required) {
        throw new InsufficientCreditsError(required, currentBalance);
      }
    }

    // 3. Try stored procedure for kernel-level atomicity
    const { data, error } = await admin.rpc('process_credit_transaction', {
      p_user_id: params.userId,
      p_booking_id: params.bookingId || null,
      p_amount: params.amount,
      p_transaction_type: params.transactionType,
      p_idempotency_key: params.idempotencyKey,
      p_description: params.description,
    });

    if (error) {
      if (error.message.includes('INSUFFICIENT_CREDITS')) {
        const balance = await this.getBalance(params.userId);
        throw new InsufficientCreditsError(Math.abs(params.amount), balance);
      }

      // Fallback insert if RPC not migrated yet
      const { data: inserted, error: insertError } = await admin
        .from('credit_ledger')
        .insert({
          user_id: params.userId,
          booking_id: params.bookingId || null,
          amount: params.amount,
          transaction_type: params.transactionType,
          idempotency_key: params.idempotencyKey,
          description: params.description,
        })
        .select('id')
        .single();

      if (insertError) {
        if (insertError.code === '23505') {
          // Unique violation on idempotency_key
          throw new ConflictError('Duplicate credit transaction detected (idempotency key match)');
        }
        throw new Error(`Failed to process credit transaction: ${insertError.message}`);
      }

      await AuditService.logEvent({
        actorId: params.userId,
        action: `credit.${params.transactionType}`,
        entityType: 'credit_ledger',
        entityId: inserted.id,
        metadata: {
          amount: params.amount,
          booking_id: params.bookingId,
          idempotency_key: params.idempotencyKey,
        },
      });

      return inserted.id;
    }

    return data;
  }

  /**
   * Grants credits to a user (Admin/System authorized).
   */
  static async grantCredits(params: {
    userId: string;
    amount: number;
    description: string;
    idempotencyKey: string;
    adminId?: string;
  }): Promise<string> {
    const transactionId = await this.processTransaction({
      userId: params.userId,
      amount: Math.abs(params.amount),
      transactionType: 'grant',
      idempotencyKey: params.idempotencyKey,
      description: params.description,
    });

    await AuditService.logEvent({
      actorId: params.adminId || null,
      action: 'credit.grant',
      entityType: 'credit_ledger',
      entityId: transactionId,
      metadata: {
        recipient_id: params.userId,
        amount: params.amount,
        description: params.description,
      },
    });

    return transactionId;
  }
}
