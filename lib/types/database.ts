/**
 * Supabase Database Definitions for LabLoop
 * Maps all 8 core tables, RPC functions, and views
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          role: 'student' | 'resource_owner' | 'verifier' | 'admin';
          department: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          role?: 'student' | 'resource_owner' | 'verifier' | 'admin';
          department?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          role?: 'student' | 'resource_owner' | 'verifier' | 'admin';
          department?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      resources: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          category: 'equipment' | 'laboratory' | 'space' | 'other';
          description: string;
          location: string;
          credit_rate: number;
          status: 'available' | 'maintenance' | 'retired';
          requires_credential: string | null;
          specifications: Json | null;
          image_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          category: 'equipment' | 'laboratory' | 'space' | 'other';
          description: string;
          location: string;
          credit_rate?: number;
          status?: 'available' | 'maintenance' | 'retired';
          requires_credential?: string | null;
          specifications?: Json | null;
          image_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          category?: 'equipment' | 'laboratory' | 'space' | 'other';
          description?: string;
          location?: string;
          credit_rate?: number;
          status?: 'available' | 'maintenance' | 'retired';
          requires_credential?: string | null;
          specifications?: Json | null;
          image_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "resources_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      bookings: {
        Row: {
          id: string;
          resource_id: string;
          requester_id: string;
          start_time: string;
          end_time: string;
          purpose: string;
          status:
            | 'requested'
            | 'approved'
            | 'rejected'
            | 'checked_in'
            | 'returned'
            | 'completed'
            | 'cancelled';
          credit_cost: number;
          decision_by: string | null;
          decision_at: string | null;
          checked_in_at: string | null;
          returned_at: string | null;
          cancellation_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          resource_id: string;
          requester_id: string;
          start_time: string;
          end_time: string;
          purpose: string;
          status?:
            | 'requested'
            | 'approved'
            | 'rejected'
            | 'checked_in'
            | 'returned'
            | 'completed'
            | 'cancelled';
          credit_cost?: number;
          decision_by?: string | null;
          decision_at?: string | null;
          checked_in_at?: string | null;
          returned_at?: string | null;
          cancellation_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          resource_id?: string;
          requester_id?: string;
          start_time?: string;
          end_time?: string;
          purpose?: string;
          status?:
            | 'requested'
            | 'approved'
            | 'rejected'
            | 'checked_in'
            | 'returned'
            | 'completed'
            | 'cancelled';
          credit_cost?: number;
          decision_by?: string | null;
          decision_at?: string | null;
          checked_in_at?: string | null;
          returned_at?: string | null;
          cancellation_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_resource_id_fkey";
            columns: ["resource_id"];
            isOneToOne: false;
            referencedRelation: "resources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_requester_id_fkey";
            columns: ["requester_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_decision_by_fkey";
            columns: ["decision_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      credentials: {
        Row: {
          id: string;
          user_id: string;
          credential_type: string;
          verification_status: 'pending' | 'verified' | 'rejected' | 'expired';
          verified_by: string | null;
          verified_at: string | null;
          expires_at: string | null;
          document_url: string | null;
          verification_notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          credential_type: string;
          verification_status?: 'pending' | 'verified' | 'rejected' | 'expired';
          verified_by?: string | null;
          verified_at?: string | null;
          expires_at?: string | null;
          document_url?: string | null;
          verification_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          credential_type?: string;
          verification_status?: 'pending' | 'verified' | 'rejected' | 'expired';
          verified_by?: string | null;
          verified_at?: string | null;
          expires_at?: string | null;
          document_url?: string | null;
          verification_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "credentials_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "credentials_verified_by_fkey";
            columns: ["verified_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      credit_ledger: {
        Row: {
          id: string;
          user_id: string;
          booking_id: string | null;
          amount: number;
          transaction_type: 'grant' | 'deduction' | 'refund' | 'adjustment';
          idempotency_key: string;
          description: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          booking_id?: string | null;
          amount: number;
          transaction_type: 'grant' | 'deduction' | 'refund' | 'adjustment';
          idempotency_key: string;
          description: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          booking_id?: string | null;
          amount?: number;
          transaction_type?: 'grant' | 'deduction' | 'refund' | 'adjustment';
          idempotency_key?: string;
          description?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "credit_ledger_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "credit_ledger_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          }
        ];
      };
      condition_reports: {
        Row: {
          id: string;
          resource_id: string;
          booking_id: string | null;
          reporter_id: string;
          report_type: 'check_in' | 'return' | 'routine_inspection';
          condition: 'excellent' | 'good' | 'fair' | 'poor' | 'damaged';
          notes: string;
          evidence_path: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          resource_id: string;
          booking_id?: string | null;
          reporter_id: string;
          report_type?: 'check_in' | 'return' | 'routine_inspection';
          condition: 'excellent' | 'good' | 'fair' | 'poor' | 'damaged';
          notes: string;
          evidence_path?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          resource_id?: string;
          booking_id?: string | null;
          reporter_id?: string;
          report_type?: 'check_in' | 'return' | 'routine_inspection';
          condition?: 'excellent' | 'good' | 'fair' | 'poor' | 'damaged';
          notes?: string;
          evidence_path?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "condition_reports_resource_id_fkey";
            columns: ["resource_id"];
            isOneToOne: false;
            referencedRelation: "resources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "condition_reports_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "condition_reports_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      incidents: {
        Row: {
          id: string;
          resource_id: string;
          booking_id: string | null;
          reporter_id: string;
          severity: 'low' | 'medium' | 'high' | 'critical';
          description: string;
          status: 'open' | 'under_review' | 'resolved' | 'dismissed';
          reviewed_by: string | null;
          resolution_notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          resource_id: string;
          booking_id?: string | null;
          reporter_id: string;
          severity?: 'low' | 'medium' | 'high' | 'critical';
          description: string;
          status?: 'open' | 'under_review' | 'resolved' | 'dismissed';
          reviewed_by?: string | null;
          resolution_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          resource_id?: string;
          booking_id?: string | null;
          reporter_id?: string;
          severity?: 'low' | 'medium' | 'high' | 'critical';
          description?: string;
          status?: 'open' | 'under_review' | 'resolved' | 'dismissed';
          reviewed_by?: string | null;
          resolution_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "incidents_resource_id_fkey";
            columns: ["resource_id"];
            isOneToOne: false;
            referencedRelation: "resources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incidents_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incidents_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incidents_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      audit_logs: {
        Row: {
          id: string;
          actor_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          metadata: Json | null;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          metadata?: Json | null;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          metadata?: Json | null;
          ip_address?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_credit_balance: {
        Args: { p_user_id: string };
        Returns: number;
      };
      process_credit_transaction: {
        Args: {
          p_user_id: string;
          p_booking_id: string | null;
          p_amount: number;
          p_transaction_type: string;
          p_idempotency_key: string;
          p_description: string;
        };
        Returns: string;
      };
      create_booking_atomic: {
        Args: {
          p_requester_id: string;
          p_resource_id: string;
          p_start_time: string;
          p_end_time: string;
          p_purpose: string;
        };
        Returns: Database['public']['Tables']['bookings']['Row'];
      };
      approve_booking_atomic: {
        Args: {
          p_booking_id: string;
          p_approver_id: string;
        };
        Returns: Database['public']['Tables']['bookings']['Row'];
      };
      reject_booking_atomic: {
        Args: {
          p_booking_id: string;
          p_decision_by: string;
          p_reason?: string;
        };
        Returns: Database['public']['Tables']['bookings']['Row'];
      };
      cancel_booking_atomic: {
        Args: {
          p_booking_id: string;
          p_canceller_id: string;
          p_reason?: string;
        };
        Returns: Database['public']['Tables']['bookings']['Row'];
      };
      check_in_booking_atomic: {
        Args: {
          p_booking_id: string;
          p_actor_id: string;
        };
        Returns: Database['public']['Tables']['bookings']['Row'];
      };
      return_booking_atomic: {
        Args: {
          p_booking_id: string;
          p_actor_id: string;
        };
        Returns: Database['public']['Tables']['bookings']['Row'];
      };
      complete_booking_atomic: {
        Args: {
          p_booking_id: string;
          p_actor_id: string;
        };
        Returns: Database['public']['Tables']['bookings']['Row'];
      };
      log_audit_event: {
        Args: {
          p_actor_id: string | null;
          p_action: string;
          p_entity_type: string;
          p_entity_id: string | null;
          p_metadata?: Json;
        };
        Returns: string;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
