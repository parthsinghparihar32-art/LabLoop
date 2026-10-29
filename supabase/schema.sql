-- LabLoop: Complete Master Database Schema
-- Generated for Supabase PostgreSQL
-- Enforces:
-- 1. Profiles & Roles (student, resource_owner, verifier, admin)
-- 2. Resources & Catalog
-- 3. Bookings with PostgreSQL GiST exclusion constraint (no overlapping approved bookings)
-- 4. Credentials & Credential Passport (with anti-self-verification check)
-- 5. Credit Ledger (auditable FairShare credit transactions with idempotency)
-- 6. Condition Reports (check-in and return tracking)
-- 7. Incidents & Review Workflow
-- 8. Audit Logs (append-only security audit trail)
-- 9. Transaction-safe atomic stored procedures
-- 10. Row Level Security (RLS) policies for all tables

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'resource_owner', 'verifier', 'admin')),
    department TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- Helper timestamp trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 2. RESOURCES
CREATE TABLE IF NOT EXISTS public.resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('equipment', 'laboratory', 'space', 'other')),
    description TEXT NOT NULL,
    location TEXT NOT NULL,
    credit_rate INTEGER NOT NULL DEFAULT 0 CHECK (credit_rate >= 0),
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'maintenance', 'retired')),
    requires_credential TEXT,
    specifications JSONB DEFAULT '{}'::jsonb,
    image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_resources_owner_id ON public.resources(owner_id);
CREATE INDEX IF NOT EXISTS idx_resources_category ON public.resources(category);
CREATE INDEX IF NOT EXISTS idx_resources_status ON public.resources(status);
CREATE INDEX IF NOT EXISTS idx_resources_requires_credential ON public.resources(requires_credential);

DROP TRIGGER IF EXISTS set_resources_updated_at ON public.resources;
CREATE TRIGGER set_resources_updated_at
    BEFORE UPDATE ON public.resources
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 3. BOOKINGS
CREATE TABLE IF NOT EXISTS public.bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL REFERENCES public.resources(id) ON DELETE RESTRICT,
    requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    purpose TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'requested' CHECK (
        status IN ('requested', 'approved', 'rejected', 'checked_in', 'returned', 'completed', 'cancelled')
    ),
    credit_cost INTEGER NOT NULL DEFAULT 0 CHECK (credit_cost >= 0),
    decision_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    decision_at TIMESTAMPTZ,
    checked_in_at TIMESTAMPTZ,
    returned_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT check_booking_time_range CHECK (end_time > start_time),
    CONSTRAINT no_overlapping_approved_bookings EXCLUDE USING gist (
        resource_id WITH =,
        tstzrange(start_time, end_time) WITH &&
    ) WHERE (status IN ('approved', 'checked_in'))
);
CREATE INDEX IF NOT EXISTS idx_bookings_resource_id ON public.bookings(resource_id);
CREATE INDEX IF NOT EXISTS idx_bookings_requester_id ON public.bookings(requester_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_timerange ON public.bookings(resource_id, start_time, end_time);

DROP TRIGGER IF EXISTS set_bookings_updated_at ON public.bookings;
CREATE TRIGGER set_bookings_updated_at
    BEFORE UPDATE ON public.bookings
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 4. CREDENTIALS
CREATE TABLE IF NOT EXISTS public.credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    credential_type TEXT NOT NULL,
    verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (
        verification_status IN ('pending', 'verified', 'rejected', 'expired')
    ),
    verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    document_url TEXT,
    verification_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT check_no_self_verification CHECK (verified_by IS NULL OR verified_by <> user_id)
);
CREATE INDEX IF NOT EXISTS idx_credentials_user_type ON public.credentials(user_id, credential_type);
CREATE INDEX IF NOT EXISTS idx_credentials_status ON public.credentials(verification_status);
CREATE INDEX IF NOT EXISTS idx_credentials_expires_at ON public.credentials(expires_at);

DROP TRIGGER IF EXISTS set_credentials_updated_at ON public.credentials;
CREATE TRIGGER set_credentials_updated_at
    BEFORE UPDATE ON public.credentials
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 5. CREDIT LEDGER
CREATE TABLE IF NOT EXISTS public.credit_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    amount INTEGER NOT NULL CHECK (amount <> 0),
    transaction_type TEXT NOT NULL CHECK (
        transaction_type IN ('grant', 'deduction', 'refund', 'adjustment')
    ),
    idempotency_key TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_id ON public.credit_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_booking_id ON public.credit_ledger(booking_id);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_idempotency ON public.credit_ledger(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_created_at ON public.credit_ledger(created_at);

-- 6. CONDITION REPORTS
CREATE TABLE IF NOT EXISTS public.condition_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL REFERENCES public.resources(id) ON DELETE RESTRICT,
    booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    report_type TEXT NOT NULL DEFAULT 'check_in' CHECK (report_type IN ('check_in', 'return', 'routine_inspection')),
    condition TEXT NOT NULL CHECK (condition IN ('excellent', 'good', 'fair', 'poor', 'damaged')),
    notes TEXT NOT NULL,
    evidence_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_condition_reports_resource ON public.condition_reports(resource_id);
CREATE INDEX IF NOT EXISTS idx_condition_reports_booking ON public.condition_reports(booking_id);
CREATE INDEX IF NOT EXISTS idx_condition_reports_reporter ON public.condition_reports(reporter_id);

-- 7. INCIDENTS
CREATE TABLE IF NOT EXISTS public.incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL REFERENCES public.resources(id) ON DELETE RESTRICT,
    booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved', 'dismissed')),
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_incidents_resource ON public.incidents(resource_id);
CREATE INDEX IF NOT EXISTS idx_incidents_booking ON public.incidents(booking_id);
CREATE INDEX IF NOT EXISTS idx_incidents_reporter ON public.incidents(reporter_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON public.incidents(status);

DROP TRIGGER IF EXISTS set_incidents_updated_at ON public.incidents;
CREATE TRIGGER set_incidents_updated_at
    BEFORE UPDATE ON public.incidents
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 8. AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

-- AUTH SIGNUP TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_full_name TEXT;
BEGIN
    v_full_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        split_part(NEW.email, '@', 1),
        'LabLoop Member'
    );

    INSERT INTO public.profiles (id, full_name, role, department)
    VALUES (
        NEW.id,
        v_full_name,
        'student',
        NEW.raw_user_meta_data->>'department'
    )
    ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        department = COALESCE(EXCLUDED.department, profiles.department),
        updated_at = timezone('utc'::text, now());

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- FUNCTIONS AND ATOMIC PROCEDURES
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
    SELECT id INTO v_existing_id
    FROM public.credit_ledger
    WHERE idempotency_key = p_idempotency_key;

    IF v_existing_id IS NOT NULL THEN
        RETURN v_existing_id;
    END IF;

    IF p_transaction_type NOT IN ('grant', 'deduction', 'refund', 'adjustment') THEN
        RAISE EXCEPTION 'Invalid transaction type: %', p_transaction_type;
    END IF;

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

    INSERT INTO public.credit_ledger (
        user_id, booking_id, amount, transaction_type, idempotency_key, description
    ) VALUES (
        p_user_id, p_booking_id, p_amount, p_transaction_type, p_idempotency_key, p_description
    ) RETURNING id INTO v_new_id;

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
    IF p_end_time <= p_start_time THEN
        RAISE EXCEPTION 'INVALID_TIME_RANGE: end_time must be strictly after start_time';
    END IF;

    IF p_start_time < (timezone('utc'::text, now()) - INTERVAL '5 minutes') THEN
        RAISE EXCEPTION 'INVALID_START_TIME: Booking cannot be placed in the past';
    END IF;

    SELECT * INTO v_resource FROM public.resources WHERE id = p_resource_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'RESOURCE_NOT_FOUND: Resource ID % does not exist', p_resource_id;
    END IF;

    IF v_resource.status <> 'available' THEN
        RAISE EXCEPTION 'RESOURCE_UNAVAILABLE: Resource status is currently %', v_resource.status;
    END IF;

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

    v_hours := EXTRACT(EPOCH FROM (p_end_time - p_start_time)) / 3600.0;
    v_cost := CEIL(v_hours * v_resource.credit_rate)::INTEGER;

    IF v_cost > 0 THEN
        v_user_balance := public.get_credit_balance(p_requester_id);
        IF v_user_balance < v_cost THEN
            RAISE EXCEPTION 'INSUFFICIENT_CREDITS: Required % credits, but user only has %', v_cost, v_user_balance;
        END IF;
    END IF;

    INSERT INTO public.bookings (
        resource_id, requester_id, start_time, end_time, purpose,
        status, credit_cost
    ) VALUES (
        p_resource_id, p_requester_id, p_start_time, p_end_time, p_purpose,
        'requested', v_cost
    ) RETURNING * INTO v_booking;

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
    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'BOOKING_NOT_FOUND: Booking % not found', p_booking_id;
    END IF;

    IF v_booking.status <> 'requested' THEN
        RAISE EXCEPTION 'INVALID_STATUS_TRANSITION: Booking status is "%", only "requested" bookings can be approved', v_booking.status;
    END IF;

    SELECT * INTO v_resource FROM public.resources WHERE id = v_booking.resource_id;
    SELECT * INTO v_approver FROM public.profiles WHERE id = p_approver_id;

    IF v_approver.role <> 'admin' AND v_resource.owner_id <> p_approver_id THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Only the resource owner or an admin may approve this booking';
    END IF;

    SELECT COUNT(*) INTO v_conflict_count
    FROM public.bookings
    WHERE resource_id = v_booking.resource_id
      AND id <> v_booking.id
      AND status IN ('approved', 'checked_in')
      AND tstzrange(start_time, end_time) && tstzrange(v_booking.start_time, v_booking.end_time);

    IF v_conflict_count > 0 THEN
        RAISE EXCEPTION 'BOOKING_CONFLICT: An approved reservation already exists for this resource in the requested interval';
    END IF;

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

    UPDATE public.bookings
    SET status = 'approved',
        decision_by = p_approver_id,
        decision_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    WHERE id = v_booking.id
    RETURNING * INTO v_booking;

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

    IF v_booking.status NOT IN ('requested', 'approved') THEN
        RAISE EXCEPTION 'INVALID_STATUS_TRANSITION: Cannot cancel booking in status "%"', v_booking.status;
    END IF;

    SELECT * INTO v_actor FROM public.profiles WHERE id = p_canceller_id;
    SELECT * INTO v_resource FROM public.resources WHERE id = v_booking.resource_id;

    IF v_booking.requester_id <> p_canceller_id AND v_resource.owner_id <> p_canceller_id AND v_actor.role <> 'admin' THEN
        RAISE EXCEPTION 'UNAUTHORIZED: You do not have permission to cancel this booking';
    END IF;

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
        RAISE EXCEPTION 'INVALID_STATUS_TRANSITION: Booking must be in "approved" status to check in';
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
        RAISE EXCEPTION 'INVALID_STATUS_TRANSITION: Booking must be in "checked_in" status to record return';
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
        RAISE EXCEPTION 'INVALID_STATUS_TRANSITION: Booking must be in "returned" status to mark complete';
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

-- ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.condition_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Profiles Policies
DROP POLICY IF EXISTS "Profiles are readable by authenticated users" ON public.profiles;
CREATE POLICY "Profiles are readable by authenticated users"
    ON public.profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT TO authenticated
    WITH CHECK (id = auth.uid() AND role = 'student');

DROP POLICY IF EXISTS "Users can update own profile except role" ON public.profiles;
CREATE POLICY "Users can update own profile except role"
    ON public.profiles FOR UPDATE TO authenticated
    USING (id = auth.uid() OR public.is_admin())
    WITH CHECK (
        (id = auth.uid() AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()))
        OR public.is_admin()
    );

-- Resources Policies
DROP POLICY IF EXISTS "Resources are readable by all" ON public.resources;
CREATE POLICY "Resources are readable by all"
    ON public.resources FOR SELECT TO authenticated
    USING (
        status IN ('available', 'maintenance')
        OR owner_id = auth.uid()
        OR public.is_admin()
    );

DROP POLICY IF EXISTS "Resource owners can create resources" ON public.resources;
CREATE POLICY "Resource owners can create resources"
    ON public.resources FOR INSERT TO authenticated
    WITH CHECK (
        owner_id = auth.uid() AND
        (public.current_user_role() IN ('resource_owner', 'admin'))
    );

DROP POLICY IF EXISTS "Owners can update own resources" ON public.resources;
CREATE POLICY "Owners can update own resources"
    ON public.resources FOR UPDATE TO authenticated
    USING (owner_id = auth.uid() OR public.is_admin())
    WITH CHECK (owner_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Owners can delete own resources" ON public.resources;
CREATE POLICY "Owners can delete own resources"
    ON public.resources FOR DELETE TO authenticated
    USING (owner_id = auth.uid() OR public.is_admin());

-- Bookings Policies
DROP POLICY IF EXISTS "View bookings policy" ON public.bookings;
CREATE POLICY "View bookings policy"
    ON public.bookings FOR SELECT TO authenticated
    USING (
        requester_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.resources r
            WHERE r.id = bookings.resource_id AND r.owner_id = auth.uid()
        )
        OR public.is_admin()
    );

DROP POLICY IF EXISTS "Requesters can insert bookings" ON public.bookings;
CREATE POLICY "Requesters can insert bookings"
    ON public.bookings FOR INSERT TO authenticated
    WITH CHECK (
        requester_id = auth.uid() AND
        status = 'requested'
    );

DROP POLICY IF EXISTS "Booking update policy" ON public.bookings;
CREATE POLICY "Booking update policy"
    ON public.bookings FOR UPDATE TO authenticated
    USING (
        requester_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.resources r
            WHERE r.id = bookings.resource_id AND r.owner_id = auth.uid()
        )
        OR public.is_admin()
    )
    WITH CHECK (
        (requester_id = auth.uid() AND status = 'cancelled')
        OR EXISTS (
            SELECT 1 FROM public.resources r
            WHERE r.id = bookings.resource_id AND r.owner_id = auth.uid()
        )
        OR public.is_admin()
    );

-- Credentials Policies
DROP POLICY IF EXISTS "Credentials view policy" ON public.credentials;
CREATE POLICY "Credentials view policy"
    ON public.credentials FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR public.current_user_role() IN ('verifier', 'admin')
    );

DROP POLICY IF EXISTS "Users can submit own credentials" ON public.credentials;
CREATE POLICY "Users can submit own credentials"
    ON public.credentials FOR INSERT TO authenticated
    WITH CHECK (
        user_id = auth.uid() AND
        verification_status = 'pending' AND
        verified_by IS NULL
    );

DROP POLICY IF EXISTS "Verifiers can update credentials" ON public.credentials;
CREATE POLICY "Verifiers can update credentials"
    ON public.credentials FOR UPDATE TO authenticated
    USING (
        public.current_user_role() IN ('verifier', 'admin')
        AND user_id <> auth.uid()
    )
    WITH CHECK (
        public.current_user_role() IN ('verifier', 'admin')
        AND user_id <> auth.uid()
    );

DROP POLICY IF EXISTS "Users can delete own pending credentials" ON public.credentials;
CREATE POLICY "Users can delete own pending credentials"
    ON public.credentials FOR DELETE TO authenticated
    USING (
        (user_id = auth.uid() AND verification_status = 'pending')
        OR public.is_admin()
    );

-- Credit Ledger Policies
DROP POLICY IF EXISTS "Credit ledger view policy" ON public.credit_ledger;
CREATE POLICY "Credit ledger view policy"
    ON public.credit_ledger FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR public.is_admin()
    );

-- Condition Reports Policies
DROP POLICY IF EXISTS "Condition reports view policy" ON public.condition_reports;
CREATE POLICY "Condition reports view policy"
    ON public.condition_reports FOR SELECT TO authenticated
    USING (
        reporter_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.resources r
            WHERE r.id = condition_reports.resource_id AND r.owner_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.bookings b
            WHERE b.id = condition_reports.booking_id AND b.requester_id = auth.uid()
        )
        OR public.is_admin()
    );

DROP POLICY IF EXISTS "Condition reports insert policy" ON public.condition_reports;
CREATE POLICY "Condition reports insert policy"
    ON public.condition_reports FOR INSERT TO authenticated
    WITH CHECK (reporter_id = auth.uid());

-- Incidents Policies
DROP POLICY IF EXISTS "Incidents view policy" ON public.incidents;
CREATE POLICY "Incidents view policy"
    ON public.incidents FOR SELECT TO authenticated
    USING (
        reporter_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.resources r
            WHERE r.id = incidents.resource_id AND r.owner_id = auth.uid()
        )
        OR public.current_user_role() IN ('verifier', 'admin')
    );

DROP POLICY IF EXISTS "Incidents insert policy" ON public.incidents;
CREATE POLICY "Incidents insert policy"
    ON public.incidents FOR INSERT TO authenticated
    WITH CHECK (reporter_id = auth.uid());

DROP POLICY IF EXISTS "Incidents update policy" ON public.incidents;
CREATE POLICY "Incidents update policy"
    ON public.incidents FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.resources r
            WHERE r.id = incidents.resource_id AND r.owner_id = auth.uid()
        )
        OR public.current_user_role() IN ('verifier', 'admin')
    );

-- Audit Logs Policies
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs"
    ON public.audit_logs FOR SELECT TO authenticated
    USING (public.is_admin());
