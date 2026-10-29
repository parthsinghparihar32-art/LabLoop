-- Migration 5: Create Credit Ledger Table
-- Purpose: Maintain an auditable, append-only ledger of FairShare credits

CREATE TABLE IF NOT EXISTS public.credit_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    amount INTEGER NOT NULL CHECK (amount <> 0), -- Positive = grant/refund, Negative = deduction
    transaction_type TEXT NOT NULL CHECK (
        transaction_type IN ('grant', 'deduction', 'refund', 'adjustment')
    ),
    idempotency_key TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Performance and idempotency indexes
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_id ON public.credit_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_booking_id ON public.credit_ledger(booking_id);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_idempotency ON public.credit_ledger(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_created_at ON public.credit_ledger(created_at);
