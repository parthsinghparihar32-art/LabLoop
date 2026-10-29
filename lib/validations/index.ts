import { z } from 'zod';

// UUID validation regex/schema
export const uuidSchema = z.string().uuid({ message: 'Must be a valid UUID' });

// ============================================================================
// RESOURCE SCHEMAS
// ============================================================================

export const resourceCategorySchema = z.enum(['equipment', 'laboratory', 'space', 'other']);
export const resourceStatusSchema = z.enum(['available', 'maintenance', 'retired']);

export const createResourceSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters').max(100),
  category: resourceCategorySchema,
  description: z.string().min(10, 'Description must be at least 10 characters').max(2000),
  location: z.string().min(2, 'Location is required').max(200),
  credit_rate: z.number().int().nonnegative('Credit rate cannot be negative').default(0),
  status: resourceStatusSchema.default('available'),
  requires_credential: z.string().trim().nullable().optional(),
  specifications: z.record(z.unknown()).optional().default({}),
  image_url: z.string().url().nullable().optional(),
});

export const updateResourceSchema = createResourceSchema.partial();

export const queryResourceSchema = z.object({
  category: resourceCategorySchema.optional(),
  status: resourceStatusSchema.optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// ============================================================================
// BOOKING SCHEMAS
// ============================================================================

export const bookingStatusSchema = z.enum([
  'requested',
  'approved',
  'rejected',
  'checked_in',
  'returned',
  'completed',
  'cancelled',
]);

export const createBookingSchema = z
  .object({
    resource_id: uuidSchema,
    start_time: z.string().datetime({ message: 'start_time must be an ISO 8601 string' }),
    end_time: z.string().datetime({ message: 'end_time must be an ISO 8601 string' }),
    purpose: z.string().min(5, 'Purpose must describe the research or educational project').max(1000),
  })
  .refine(
    (data) => {
      const start = new Date(data.start_time).getTime();
      const end = new Date(data.end_time).getTime();
      return end > start;
    },
    {
      message: 'end_time must be strictly after start_time',
      path: ['end_time'],
    }
  );

export const bookingDecisionSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const cancelBookingSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const queryBookingSchema = z.object({
  resource_id: uuidSchema.optional(),
  status: bookingStatusSchema.optional(),
  role_view: z.enum(['requester', 'owner', 'all']).default('requester'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// ============================================================================
// CREDENTIAL SCHEMAS
// ============================================================================

export const credentialStatusSchema = z.enum(['pending', 'verified', 'rejected', 'expired']);

export const submitCredentialSchema = z.object({
  credential_type: z.string().min(3).max(100),
  document_url: z.string().url().nullable().optional(),
  verification_notes: z.string().max(1000).optional(),
});

export const verifyCredentialSchema = z.object({
  verification_status: z.enum(['verified', 'rejected']),
  verification_notes: z.string().max(1000).optional(),
  expires_at: z.string().datetime().nullable().optional(),
});

// ============================================================================
// CREDIT SCHEMAS
// ============================================================================

export const creditTransactionTypeSchema = z.enum(['grant', 'deduction', 'refund', 'adjustment']);

export const grantCreditSchema = z.object({
  user_id: uuidSchema,
  amount: z.number().int().positive('Grant amount must be positive'),
  description: z.string().min(3).max(255),
  idempotency_key: z.string().min(8).max(128),
});

// ============================================================================
// CONDITION REPORT SCHEMAS
// ============================================================================

export const conditionLevelSchema = z.enum(['excellent', 'good', 'fair', 'poor', 'damaged']);
export const conditionReportTypeSchema = z.enum(['check_in', 'return', 'routine_inspection']);

export const createConditionReportSchema = z.object({
  resource_id: uuidSchema,
  booking_id: uuidSchema.nullable().optional(),
  report_type: conditionReportTypeSchema.default('check_in'),
  condition: conditionLevelSchema,
  notes: z.string().min(5, 'Notes must be descriptive').max(1000),
  evidence_path: z.string().nullable().optional(),
});

// ============================================================================
// INCIDENT SCHEMAS
// ============================================================================

export const incidentSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export const incidentStatusSchema = z.enum(['open', 'under_review', 'resolved', 'dismissed']);

export const createIncidentSchema = z.object({
  resource_id: uuidSchema,
  booking_id: uuidSchema.nullable().optional(),
  severity: incidentSeveritySchema.default('medium'),
  description: z.string().min(10, 'Description must be at least 10 characters').max(2000),
});

export const reviewIncidentSchema = z.object({
  status: z.enum(['under_review', 'resolved', 'dismissed']),
  resolution_notes: z.string().min(5).max(2000),
});
