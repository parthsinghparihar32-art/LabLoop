/**
 * LabLoop Domain Types & Shared Contracts
 * Member 2: Backend, Database & Booking System
 */

export type UserRole = 'student' | 'resource_owner' | 'verifier' | 'admin';

export type ResourceCategory = 'equipment' | 'laboratory' | 'space' | 'other';

export type ResourceStatus = 'available' | 'maintenance' | 'retired';

export type BookingStatus =
  | 'requested'
  | 'approved'
  | 'rejected'
  | 'checked_in'
  | 'returned'
  | 'completed'
  | 'cancelled';

export type CredentialVerificationStatus =
  | 'pending'
  | 'verified'
  | 'rejected'
  | 'expired';

export type CreditTransactionType =
  | 'grant'
  | 'deduction'
  | 'refund'
  | 'adjustment';

export type ConditionLevel =
  | 'excellent'
  | 'good'
  | 'fair'
  | 'poor'
  | 'damaged';

export type ConditionReportType =
  | 'check_in'
  | 'return'
  | 'routine_inspection';

export type IncidentSeverity =
  | 'low'
  | 'medium'
  | 'high'
  | 'critical';

export type IncidentStatus =
  | 'open'
  | 'under_review'
  | 'resolved'
  | 'dismissed';

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  department?: string | null;
  avatar_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Resource {
  id: string;
  owner_id: string;
  name: string;
  category: ResourceCategory;
  description: string;
  location: string;
  credit_rate: number;
  status: ResourceStatus;
  requires_credential?: string | null;
  specifications?: Record<string, unknown>;
  image_url?: string | null;
  created_at: string;
  updated_at: string;
  owner?: Partial<Profile>;
}

export interface Booking {
  id: string;
  resource_id: string;
  requester_id: string;
  start_time: string;
  end_time: string;
  purpose: string;
  status: BookingStatus;
  credit_cost: number;
  decision_by?: string | null;
  decision_at?: string | null;
  checked_in_at?: string | null;
  returned_at?: string | null;
  cancellation_reason?: string | null;
  created_at: string;
  updated_at: string;
  resource?: Partial<Resource>;
  requester?: Partial<Profile>;
  decision_maker?: Partial<Profile>;
}

export interface Credential {
  id: string;
  user_id: string;
  credential_type: string;
  verification_status: CredentialVerificationStatus;
  verified_by?: string | null;
  verified_at?: string | null;
  expires_at?: string | null;
  document_url?: string | null;
  verification_notes?: string | null;
  created_at: string;
  updated_at: string;
  user?: Partial<Profile>;
  verifier?: Partial<Profile>;
}

export interface CreditLedgerEntry {
  id: string;
  user_id: string;
  booking_id?: string | null;
  amount: number;
  transaction_type: CreditTransactionType;
  idempotency_key: string;
  description: string;
  created_at: string;
}

export interface ConditionReport {
  id: string;
  resource_id: string;
  booking_id?: string | null;
  reporter_id: string;
  report_type: ConditionReportType;
  condition: ConditionLevel;
  notes: string;
  evidence_path?: string | null;
  created_at: string;
  reporter?: Partial<Profile>;
}

export interface Incident {
  id: string;
  resource_id: string;
  booking_id?: string | null;
  reporter_id: string;
  severity: IncidentSeverity;
  description: string;
  status: IncidentStatus;
  reviewed_by?: string | null;
  resolution_notes?: string | null;
  created_at: string;
  updated_at: string;
  reporter?: Partial<Profile>;
  reviewer?: Partial<Profile>;
}

export interface AuditLog {
  id: string;
  actor_id?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  metadata?: Record<string, unknown>;
  ip_address?: string | null;
  created_at: string;
  actor?: Partial<Profile>;
}
