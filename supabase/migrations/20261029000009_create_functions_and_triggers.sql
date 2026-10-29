-- Migration 9: Transactional Database Functions & Stored Procedures
-- Purpose: Enforce business invariants, atomic transitions, and audit trails at PostgreSQL level

-- 1. Helper function: Get Current Credit Balance
CREATE OR REPLACE FUNCTION public.get_credit_balance(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_balance INTEGER;
BEGIN
    SELECT COALESCE(SUM(amount), 0)::INTEGER
    INTO v_balance
    FROM public.credit_ledger
    WHERE user_id = p_user_id;

    RETURN v_balance;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 2. Audit Logging Helper
CREATE OR REPLACE FUNCTION public.log_audit_event(
    p_actor_id UUID,
    p_action TEXT,
    p_entity_type TEXT,
    p_entity_id TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    VALUES (p_actor_id, p_action, p_entity_type, p_entity_id, p_metadata)
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Atomic Credit Transaction Handler
-- Enforces non-negative balance checks and idempotency
CREATE OR REPLACE FUNCTION public.process_credit_transaction(
    p_user_id UUID,
    p_booking_id UUID,
    p_amount INTEGER,
    p_transaction_type TEXT,
    p_idempotency_key TEXT,
    p_description TEXT
)
RETURNS UUID AS $$
DECLARE
    v_current_balance INTEGER;
    v_new_id UUID;
    v_existing_id UUID;
BEGIN
    -- Idempotency check: return existing transaction ID if already processed
    SELECT id INTO v_existing_id
    FROM public.credit_ledger
    WHERE idempotency_key = p_idempotency_key;

    IF v_existing_id IS NOT NULL THEN
        RETURN v_existing_id;
    END IF;

    -- Validate transaction type
    IF p_transaction_type NOT IN ('grant', 'deduction', 'refund', 'adjustment') THEN
        RAISE EXCEPTION 'Invalid transaction type: %', p_transaction_type;
    END IF;

    -- For deductions, lock user ledger rows to serialize balance check and prevent race conditions
    IF p_amount < 0 THEN
        SELECT COALESCE(SUM(amount), 0)::INTEGER
        INTO v_current_balance
        FROM public.credit_ledger
        WHERE user_id = p_user_id
        FOR UPDATE;

        IF (v_current_balance + p_amount) < 0 THEN
            RAISE EXCEPTION 'INSUFFICIENT_CREDITS: User has % credits, deduction requires %', v_current_balance, ABS(p_amount);
        END IF;
    END IF;

    -- Insert ledger record
    INSERT INTO public.credit_ledger (
        user_id, booking_id, amount, transaction_type, idempotency_key, description
    ) VALUES (
        p_user_id, p_booking_id, p_amount, p_transaction_type, p_idempotency_key, p_description
    ) RETURNING id INTO v_new_id;

    -- Record audit log
    PERFORM public.log_audit_event(
        p_user_id,
        'credit.' || p_transaction_type,
        'credit_ledger',
        v_new_id::text,
        jsonb_build_object(
            'amount', p_amount,
            'booking_id', p_booking_id,
            'idempotency_key', p_idempotency_key
        )
    );

    RETURN v_new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Atomic Booking Creation Function
-- Verifies resource availability, credential eligibility, and credit balance
CREATE OR REPLACE FUNCTION public.create_booking_atomic(
    p_requester_id UUID,
    p_resource_id UUID,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ,
    p_purpose TEXT
)
RETURNS public.bookings AS $$
DECLARE
    v_resource public.resources%ROWTYPE;
    v_hours NUMERIC;
    v_cost INTEGER;
    v_user_balance INTEGER;
    v_has_credential BOOLEAN;
    v_booking public.bookings%ROWTYPE;
BEGIN
    -- 1. Validate time boundaries
    IF p_end_time <= p_start_time THEN
        RAISE EXCEPTION 'INVALID_TIME_RANGE: end_time must be strictly after start_time';
    END IF;

    IF p_start_time < (timezone('utc'::text, now()) - INTERVAL '5 minutes') THEN
        RAISE EXCEPTION 'INVALID_START_TIME: Booking cannot be placed in the past';
    END IF;

    -- 2. Lock and retrieve resource details
    SELECT * INTO v_resource
    FROM public.resources
    WHERE id = p_resource_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'RESOURCE_NOT_FOUND: Resource ID % does not exist', p_resource_id;
    END IF;

    IF v_resource.status <> 'available' THEN
        RAISE EXCEPTION 'RESOURCE_UNAVAILABLE: Resource status is currently %', v_resource.status;
    END IF;

    -- 3. Check Credential Requirements if any
    IF v_resource.requires_credential IS NOT NULL AND v_resource.requires_credential <> '' THEN
        SELECT EXISTS (
            SELECT 1 FROM public.credentials
            WHERE user_id = p_requester_id
              AND credential_type = v_resource.requires_credential
              AND verification_status = 'verified'
              AND (expires_at IS NULL OR expires_at > p_end_time)
        ) INTO v_has_credential;

        IF NOT v_has_credential THEN
            RAISE EXCEPTION 'CREDENTIAL_REQUIRED: Resource requires verified active credential "%"', v_resource.requires_credential;
        END IF;
    END IF;

    -- 4. Calculate Duration and Trusted Credit Cost
    -- Minimum duration calculation in whole or fractional hours rounded up
    v_hours := EXTRACT(EPOCH FROM (p_end_time - p_start_time)) / 3600.0;
    v_cost := CEIL(v_hours * v_resource.credit_rate)::INTEGER;

    -- 5. Verify Requester Credit Balance
    IF v_cost > 0 THEN
        v_user_balance := public.get_credit_balance(p_requester_id);
        IF v_user_balance < v_cost THEN
            RAISE EXCEPTION 'INSUFFICIENT_CREDITS: Required % credits, but user only has %', v_cost, v_user_balance;
        END IF;
    END IF;

    -- 6. Insert Booking record with initial status 'requested'
    INSERT INTO public.bookings (
        resource_id, requester_id, start_time, end_time, purpose,
        status, credit_cost
    ) VALUES (
        p_resource_id, p_requester_id, p_start_time, p_end_time, p_purpose,
        'requested', v_cost
    ) RETURNING * INTO v_booking;

    -- 7. Audit Log
    PERFORM public.log_audit_event(
        p_requester_id,
        'booking.created',
        'bookings',
        v_booking.id::text,
        jsonb_build_object(
            'resource_id', p_resource_id,
            'start_time', p_start_time,
            'end_time', p_end_time,
            'credit_cost', v_cost
        )
    );

    RETURN v_booking;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Atomic Booking Approval Function
-- Checks authorization, locks row, verifies no overlapping approved bookings,
-- and atomically deducts credits
CREATE OR REPLACE FUNCTION public.approve_booking_atomic(
    p_booking_id UUID,
    p_approver_id UUID
)
RETURNS public.bookings AS $$
DECLARE
    v_booking public.bookings%ROWTYPE;
    v_resource public.resources%ROWTYPE;
    v_approver public.profiles%ROWTYPE;
    v_conflict_count INTEGER;
    v_idempotency_key TEXT;
BEGIN
    -- 1. Lock booking row
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'BOOKING_NOT_FOUND: Booking % not found', p_booking_id;
    END IF;

    IF v_booking.status <> 'requested' THEN
        RAISE EXCEPTION 'INVALID_STATUS_TRANSITION: Booking status is "%", only "requested" bookings can be approved', v_booking.status;
    END IF;

    -- 2. Authorization check: approver must be resource owner or an admin
    SELECT * INTO v_resource FROM public.resources WHERE id = v_booking.resource_id;
    SELECT * INTO v_approver FROM public.profiles WHERE id = p_approver_id;

    IF v_approver.role <> 'admin' AND v_resource.owner_id <> p_approver_id THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Only the resource owner or an admin may approve this booking';
    END IF;

    -- 3. Re-verify overlapping approved or checked-in bookings (concurrency check)
    SELECT COUNT(*) INTO v_conflict_count
    FROM public.bookings
    WHERE resource_id = v_booking.resource_id
      AND id <> v_booking.id
      AND status IN ('approved', 'checked_in')
      AND tstzrange(start_time, end_time) && tstzrange(v_booking.start_time, v_booking.end_time);

    IF v_conflict_count > 0 THEN
        RAISE EXCEPTION 'BOOKING_CONFLICT: An approved reservation already exists for this resource in the requested interval';
    END IF;

    -- 4. Deduct credits atomically from requester if credit_cost > 0
    IF v_booking.credit_cost > 0 THEN
        v_idempotency_key := 'booking-approve-' || v_booking.id::text;
        PERFORM public.process_credit_transaction(
            v_booking.requester_id,
            v_booking.id,
            -v_booking.credit_cost,
            'deduction',
            v_idempotency_key,
            'Credit deduction for approved booking #' || substring(v_booking.id::text, 1, 8)
        );
    END IF;

    -- 5. Update booking status to 'approved'
    UPDATE public.bookings
    SET status = 'approved',
        decision_by = p_approver_id,
        decision_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    WHERE id = v_booking.id
    RETURNING * INTO v_booking;

    -- 6. Audit Log
    PERFORM public.log_audit_event(
        p_approver_id,
        'booking.approved',
        'bookings',
        v_booking.id::text,
        jsonb_build_object(
            'requester_id', v_booking.requester_id,
            'resource_id', v_booking.resource_id,
            'credit_cost', v_booking.credit_cost
        )
    );

    RETURN v_booking;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Atomic Booking Rejection Function
CREATE OR REPLACE FUNCTION public.reject_booking_atomic(
    p_booking_id UUID,
    p_decision_by UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS public.bookings AS $$
DECLARE
    v_booking public.bookings%ROWTYPE;
    v_resource public.resources%ROWTYPE;
    v_actor public.profiles%ROWTYPE;
BEGIN
    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'BOOKING_NOT_FOUND: Booking % not found', p_booking_id;
    END IF;

    IF v_booking.status <> 'requested' THEN
        RAISE EXCEPTION 'INVALID_STATUS_TRANSITION: Only "requested" bookings can be rejected';
    END IF;

    SELECT * INTO v_resource FROM public.resources WHERE id = v_booking.resource_id;
    SELECT * INTO v_actor FROM public.profiles WHERE id = p_decision_by;

    IF v_actor.role <> 'admin' AND v_resource.owner_id <> p_decision_by THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Only the resource owner or an admin may reject this booking';
    END IF;

    UPDATE public.bookings
    SET status = 'rejected',
        decision_by = p_decision_by,
        decision_at = timezone('utc'::text, now()),
        cancellation_reason = p_reason,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_booking.id
    RETURNING * INTO v_booking;

    PERFORM public.log_audit_event(
        p_decision_by,
        'booking.rejected',
        'bookings',
        v_booking.id::text,
        jsonb_build_object('reason', p_reason)
    );

    RETURN v_booking;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Atomic Booking Cancellation Function with Automatic Credit Refund
CREATE OR REPLACE FUNCTION public.cancel_booking_atomic(
    p_booking_id UUID,
    p_canceller_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS public.bookings AS $$
DECLARE
    v_booking public.bookings%ROWTYPE;
    v_actor public.profiles%ROWTYPE;
    v_resource public.resources%ROWTYPE;
    v_idempotency_key TEXT;
BEGIN
    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'BOOKING_NOT_FOUND: Booking % not found', p_booking_id;
    END IF;

    -- Only requested or approved bookings can be cancelled
    IF v_booking.status NOT IN ('requested', 'approved') THEN
        RAISE EXCEPTION 'INVALID_STATUS_TRANSITION: Cannot cancel booking in status "%"', v_booking.status;
    END IF;

    SELECT * INTO v_actor FROM public.profiles WHERE id = p_canceller_id;
    SELECT * INTO v_resource FROM public.resources WHERE id = v_booking.resource_id;

    -- Requester, resource owner, or admin can cancel
    IF v_booking.requester_id <> p_canceller_id AND v_resource.owner_id <> p_canceller_id AND v_actor.role <> 'admin' THEN
        RAISE EXCEPTION 'UNAUTHORIZED: You do not have permission to cancel this booking';
    END IF;

    -- If booking was approved and credits were deducted, refund them atomically
    IF v_booking.status = 'approved' AND v_booking.credit_cost > 0 THEN
        v_idempotency_key := 'booking-refund-cancel-' || v_booking.id::text;
        PERFORM public.process_credit_transaction(
            v_booking.requester_id,
            v_booking.id,
            v_booking.credit_cost,
            'refund',
            v_idempotency_key,
            'Credit refund for cancelled booking #' || substring(v_booking.id::text, 1, 8)
        );
    END IF;

    UPDATE public.bookings
    SET status = 'cancelled',
        cancellation_reason = p_reason,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_booking.id
    RETURNING * INTO v_booking;

    PERFORM public.log_audit_event(
        p_canceller_id,
        'booking.cancelled',
        'bookings',
        v_booking.id::text,
        jsonb_build_object('reason', p_reason)
    );

    RETURN v_booking;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Atomic Check-in Function
CREATE OR REPLACE FUNCTION public.check_in_booking_atomic(
    p_booking_id UUID,
    p_actor_id UUID
)
RETURNS public.bookings AS $$
DECLARE
    v_booking public.bookings%ROWTYPE;
    v_resource public.resources%ROWTYPE;
    v_actor public.profiles%ROWTYPE;
BEGIN
    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'BOOKING_NOT_FOUND: Booking % not found', p_booking_id;
    END IF;

    IF v_booking.status <> 'approved' THEN
        RAISE EXCEPTION 'INVALID_STATUS_TRANSITION: Booking must be in "approved" status to check in (current status: %)', v_booking.status;
    END IF;

    SELECT * INTO v_resource FROM public.resources WHERE id = v_booking.resource_id;
    SELECT * INTO v_actor FROM public.profiles WHERE id = p_actor_id;

    IF v_booking.requester_id <> p_actor_id AND v_resource.owner_id <> p_actor_id AND v_actor.role <> 'admin' THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Only the requester, resource owner, or admin can perform check-in';
    END IF;

    UPDATE public.bookings
    SET status = 'checked_in',
        checked_in_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    WHERE id = v_booking.id
    RETURNING * INTO v_booking;

    PERFORM public.log_audit_event(
        p_actor_id,
        'booking.checked_in',
        'bookings',
        v_booking.id::text,
        jsonb_build_object('checked_in_at', v_booking.checked_in_at)
    );

    RETURN v_booking;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Atomic Return Function
CREATE OR REPLACE FUNCTION public.return_booking_atomic(
    p_booking_id UUID,
    p_actor_id UUID
)
RETURNS public.bookings AS $$
DECLARE
    v_booking public.bookings%ROWTYPE;
    v_resource public.resources%ROWTYPE;
    v_actor public.profiles%ROWTYPE;
BEGIN
    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'BOOKING_NOT_FOUND: Booking % not found', p_booking_id;
    END IF;

    IF v_booking.status <> 'checked_in' THEN
        RAISE EXCEPTION 'INVALID_STATUS_TRANSITION: Booking must be in "checked_in" status to record return (current status: %)', v_booking.status;
    END IF;

    SELECT * INTO v_resource FROM public.resources WHERE id = v_booking.resource_id;
    SELECT * INTO v_actor FROM public.profiles WHERE id = p_actor_id;

    IF v_booking.requester_id <> p_actor_id AND v_resource.owner_id <> p_actor_id AND v_actor.role <> 'admin' THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Only the requester, resource owner, or admin can record return';
    END IF;

    UPDATE public.bookings
    SET status = 'returned',
        returned_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    WHERE id = v_booking.id
    RETURNING * INTO v_booking;

    PERFORM public.log_audit_event(
        p_actor_id,
        'booking.returned',
        'bookings',
        v_booking.id::text,
        jsonb_build_object('returned_at', v_booking.returned_at)
    );

    RETURN v_booking;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Atomic Complete Function
CREATE OR REPLACE FUNCTION public.complete_booking_atomic(
    p_booking_id UUID,
    p_actor_id UUID
)
RETURNS public.bookings AS $$
DECLARE
    v_booking public.bookings%ROWTYPE;
    v_resource public.resources%ROWTYPE;
    v_actor public.profiles%ROWTYPE;
BEGIN
    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'BOOKING_NOT_FOUND: Booking % not found', p_booking_id;
    END IF;

    IF v_booking.status <> 'returned' THEN
        RAISE EXCEPTION 'INVALID_STATUS_TRANSITION: Booking must be in "returned" status to mark complete (current status: %)', v_booking.status;
    END IF;

    SELECT * INTO v_resource FROM public.resources WHERE id = v_booking.resource_id;
    SELECT * INTO v_actor FROM public.profiles WHERE id = p_actor_id;

    IF v_resource.owner_id <> p_actor_id AND v_actor.role <> 'admin' THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Only the resource owner or admin can mark a booking completed';
    END IF;

    UPDATE public.bookings
    SET status = 'completed',
        updated_at = timezone('utc'::text, now())
    WHERE id = v_booking.id
    RETURNING * INTO v_booking;

    PERFORM public.log_audit_event(
        p_actor_id,
        'booking.completed',
        'bookings',
        v_booking.id::text,
        jsonb_build_object('completed_at', v_booking.updated_at)
    );

    RETURN v_booking;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
