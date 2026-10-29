-- Migration 6: Create Condition Reports Table
-- Purpose: Track resource condition during check-in, return, and inspection

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

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_condition_reports_resource ON public.condition_reports(resource_id);
CREATE INDEX IF NOT EXISTS idx_condition_reports_booking ON public.condition_reports(booking_id);
CREATE INDEX IF NOT EXISTS idx_condition_reports_reporter ON public.condition_reports(reporter_id);
