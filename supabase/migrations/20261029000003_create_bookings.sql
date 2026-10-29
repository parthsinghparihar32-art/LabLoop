-- Migration 3: Create Bookings Table with PostgreSQL Exclusion Constraint
-- Purpose: Manage reservation requests, lifecycle, and concurrency-safe conflict prevention

-- btree_gist extension is required for GiST exclusion constraints with UUID and tstzrange
CREATE EXTENSION IF NOT EXISTS btree_gist;

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

    -- Temporal integrity constraint: end time must be strictly after start time
    CONSTRAINT check_booking_time_range CHECK (end_time > start_time),

    -- Database-level concurrency-safe exclusion constraint:
    -- Guarantees at PostgreSQL kernel level that no two bookings for the same resource
    -- with overlapping time ranges can simultaneously be 'approved' or 'checked_in'.
    CONSTRAINT no_overlapping_approved_bookings EXCLUDE USING gist (
        resource_id WITH =,
        tstzrange(start_time, end_time) WITH &&
    ) WHERE (status IN ('approved', 'checked_in'))
);

-- Query optimization indexes
CREATE INDEX IF NOT EXISTS idx_bookings_resource_id ON public.bookings(resource_id);
CREATE INDEX IF NOT EXISTS idx_bookings_requester_id ON public.bookings(requester_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_timerange ON public.bookings(resource_id, start_time, end_time);

-- Attach updated_at trigger
DROP TRIGGER IF EXISTS set_bookings_updated_at ON public.bookings;
CREATE TRIGGER set_bookings_updated_at
    BEFORE UPDATE ON public.bookings
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
