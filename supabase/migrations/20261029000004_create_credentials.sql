-- Migration 4: Create Credentials Table
-- Purpose: Store training, certifications, and verification records for Credential Passport

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

    -- Anti-tampering constraint: users can never verify their own credentials
    CONSTRAINT check_no_self_verification CHECK (verified_by IS NULL OR verified_by <> user_id)
);

-- Performance and lookup indexes
CREATE INDEX IF NOT EXISTS idx_credentials_user_type ON public.credentials(user_id, credential_type);
CREATE INDEX IF NOT EXISTS idx_credentials_status ON public.credentials(verification_status);
CREATE INDEX IF NOT EXISTS idx_credentials_expires_at ON public.credentials(expires_at);

-- Attach updated_at trigger
DROP TRIGGER IF EXISTS set_credentials_updated_at ON public.credentials;
CREATE TRIGGER set_credentials_updated_at
    BEFORE UPDATE ON public.credentials
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
