-- Migration 10: Row Level Security (RLS) Policies
-- Purpose: Enforce strict authorization rules for all 8 core tables

-- Enable RLS on all 8 tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.condition_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper security function: Check current user role
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper security function: Check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================================
-- 1. PROFILES POLICIES
-- ============================================================================

-- Any authenticated user can read profiles (needed for resource owner names, requesters, etc.)
DROP POLICY IF EXISTS "Profiles are readable by authenticated users" ON public.profiles;
CREATE POLICY "Profiles are readable by authenticated users"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (true);

-- Users can insert their own profile with 'student' role only
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT
    TO authenticated
    WITH CHECK (
        id = auth.uid() AND
        role = 'student'
    );

-- Users can update their own profile fields, but CANNOT self-elevate role
DROP POLICY IF EXISTS "Users can update own profile except role" ON public.profiles;
CREATE POLICY "Users can update own profile except role"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (id = auth.uid() OR public.is_admin())
    WITH CHECK (
        (id = auth.uid() AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()))
        OR public.is_admin()
    );

-- ============================================================================
-- 2. RESOURCES POLICIES
-- ============================================================================

-- Active resources are viewable by anyone; retired resources viewable by owner or admin
DROP POLICY IF EXISTS "Resources are readable by all" ON public.resources;
CREATE POLICY "Resources are readable by all"
    ON public.resources FOR SELECT
    TO authenticated
    USING (
        status IN ('available', 'maintenance')
        OR owner_id = auth.uid()
        OR public.is_admin()
    );

-- Resource owners and admins can create resources
DROP POLICY IF EXISTS "Resource owners can create resources" ON public.resources;
CREATE POLICY "Resource owners can create resources"
    ON public.resources FOR INSERT
    TO authenticated
    WITH CHECK (
        owner_id = auth.uid() AND
        (public.current_user_role() IN ('resource_owner', 'admin'))
    );

-- Only resource owners or admins can update resources
DROP POLICY IF EXISTS "Owners can update own resources" ON public.resources;
CREATE POLICY "Owners can update own resources"
    ON public.resources FOR UPDATE
    TO authenticated
    USING (owner_id = auth.uid() OR public.is_admin())
    WITH CHECK (owner_id = auth.uid() OR public.is_admin());

-- Only resource owners or admins can delete/retire resources
DROP POLICY IF EXISTS "Owners can delete own resources" ON public.resources;
CREATE POLICY "Owners can delete own resources"
    ON public.resources FOR DELETE
    TO authenticated
    USING (owner_id = auth.uid() OR public.is_admin());

-- ============================================================================
-- 3. BOOKINGS POLICIES
-- ============================================================================

-- Requesters, resource owners, and admins can view relevant bookings
DROP POLICY IF EXISTS "View bookings policy" ON public.bookings;
CREATE POLICY "View bookings policy"
    ON public.bookings FOR SELECT
    TO authenticated
    USING (
        requester_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.resources r
            WHERE r.id = bookings.resource_id AND r.owner_id = auth.uid()
        )
        OR public.is_admin()
    );

-- Authenticated users can insert their own booking requests with 'requested' status
DROP POLICY IF EXISTS "Requesters can insert bookings" ON public.bookings;
CREATE POLICY "Requesters can insert bookings"
    ON public.bookings FOR INSERT
    TO authenticated
    WITH CHECK (
        requester_id = auth.uid() AND
        status = 'requested'
    );

-- Booking updates: Requesters can cancel; Owners and admins can transition status
DROP POLICY IF EXISTS "Booking update policy" ON public.bookings;
CREATE POLICY "Booking update policy"
    ON public.bookings FOR UPDATE
    TO authenticated
    USING (
        requester_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.resources r
            WHERE r.id = bookings.resource_id AND r.owner_id = auth.uid()
        )
        OR public.is_admin()
    )
    WITH CHECK (
        -- Requester can only transition to 'cancelled'
        (requester_id = auth.uid() AND status = 'cancelled')
        -- Resource owner or admin can update according to business rules
        OR EXISTS (
            SELECT 1 FROM public.resources r
            WHERE r.id = bookings.resource_id AND r.owner_id = auth.uid()
        )
        OR public.is_admin()
    );

-- ============================================================================
-- 4. CREDENTIALS POLICIES
-- ============================================================================

-- Users can view their own credentials; verifiers and admins can view all
DROP POLICY IF EXISTS "Credentials view policy" ON public.credentials;
CREATE POLICY "Credentials view policy"
    ON public.credentials FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid()
        OR public.current_user_role() IN ('verifier', 'admin')
    );

-- Users can upload/submit credentials for themselves with 'pending' status
DROP POLICY IF EXISTS "Users can submit own credentials" ON public.credentials;
CREATE POLICY "Users can submit own credentials"
    ON public.credentials FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = auth.uid() AND
        verification_status = 'pending' AND
        verified_by IS NULL
    );

-- Only verifiers and admins can update verification status (no self-verification)
DROP POLICY IF EXISTS "Verifiers can update credentials" ON public.credentials;
CREATE POLICY "Verifiers can update credentials"
    ON public.credentials FOR UPDATE
    TO authenticated
    USING (
        public.current_user_role() IN ('verifier', 'admin')
        AND user_id <> auth.uid() -- Enforce prohibition of self-verification
    )
    WITH CHECK (
        public.current_user_role() IN ('verifier', 'admin')
        AND user_id <> auth.uid()
    );

-- Users can delete their own pending credentials
DROP POLICY IF EXISTS "Users can delete own pending credentials" ON public.credentials;
CREATE POLICY "Users can delete own pending credentials"
    ON public.credentials FOR DELETE
    TO authenticated
    USING (
        (user_id = auth.uid() AND verification_status = 'pending')
        OR public.is_admin()
    );

-- ============================================================================
-- 5. CREDIT LEDGER POLICIES
-- ============================================================================

-- Users can read their own credit history; admins can view all
DROP POLICY IF EXISTS "Credit ledger view policy" ON public.credit_ledger;
CREATE POLICY "Credit ledger view policy"
    ON public.credit_ledger FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid()
        OR public.is_admin()
    );

-- Direct client INSERT, UPDATE, DELETE are completely prohibited.
-- Mutations must occur via trusted security definer functions or service-role.
-- (No INSERT/UPDATE/DELETE policies are granted to authenticated role)

-- ============================================================================
-- 6. CONDITION REPORTS POLICIES
-- ============================================================================

-- View condition reports for involved parties
DROP POLICY IF EXISTS "Condition reports view policy" ON public.condition_reports;
CREATE POLICY "Condition reports view policy"
    ON public.condition_reports FOR SELECT
    TO authenticated
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

-- Authorized participants can insert condition reports
DROP POLICY IF EXISTS "Condition reports insert policy" ON public.condition_reports;
CREATE POLICY "Condition reports insert policy"
    ON public.condition_reports FOR INSERT
    TO authenticated
    WITH CHECK (
        reporter_id = auth.uid()
    );

-- ============================================================================
-- 7. INCIDENTS POLICIES
-- ============================================================================

-- Incidents viewable by reporter, resource owner, verifiers, admins
DROP POLICY IF EXISTS "Incidents view policy" ON public.incidents;
CREATE POLICY "Incidents view policy"
    ON public.incidents FOR SELECT
    TO authenticated
    USING (
        reporter_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.resources r
            WHERE r.id = incidents.resource_id AND r.owner_id = auth.uid()
        )
        OR public.current_user_role() IN ('verifier', 'admin')
    );

-- Users can report incidents
DROP POLICY IF EXISTS "Incidents insert policy" ON public.incidents;
CREATE POLICY "Incidents insert policy"
    ON public.incidents FOR INSERT
    TO authenticated
    WITH CHECK (
        reporter_id = auth.uid()
    );

-- Resource owners and admins can review/update incidents
DROP POLICY IF EXISTS "Incidents update policy" ON public.incidents;
CREATE POLICY "Incidents update policy"
    ON public.incidents FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.resources r
            WHERE r.id = incidents.resource_id AND r.owner_id = auth.uid()
        )
        OR public.current_user_role() IN ('verifier', 'admin')
    );

-- ============================================================================
-- 8. AUDIT LOGS POLICIES
-- ============================================================================

-- Only admins can read audit logs
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs"
    ON public.audit_logs FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- No direct client INSERT, UPDATE, or DELETE on audit logs.
-- Handled exclusively via security definer function log_audit_event or service-role.
