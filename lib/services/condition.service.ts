import { createAdminClient } from '@/lib/supabase/admin';
import type { ConditionReport, ConditionLevel, ConditionReportType } from '@/lib/types/models';
import { AuditService } from './audit.service';

export class ConditionService {
  /**
   * Submits a condition report for a resource (at check-in, return, or inspection).
   */
  static async createReport(
    reporterId: string,
    data: {
      resource_id: string;
      booking_id?: string | null;
      report_type: ConditionReportType;
      condition: ConditionLevel;
      notes: string;
      evidence_path?: string | null;
    }
  ): Promise<ConditionReport> {
    const admin = createAdminClient();

    const { data: created, error } = await admin
      .from('condition_reports')
      .insert({
        resource_id: data.resource_id,
        booking_id: data.booking_id || null,
        reporter_id: reporterId,
        report_type: data.report_type,
        condition: data.condition,
        notes: data.notes,
        evidence_path: data.evidence_path || null,
      })
      .select('*, reporter:profiles!reporter_id(full_name, role)')
      .single();

    if (error) {
      throw new Error(`Failed to create condition report: ${error.message}`);
    }

    await AuditService.logEvent({
      actorId: reporterId,
      action: 'condition_report.created',
      entityType: 'condition_reports',
      entityId: created.id,
      metadata: {
        resource_id: data.resource_id,
        booking_id: data.booking_id,
        condition: data.condition,
        report_type: data.report_type,
      },
    });

    return created as unknown as ConditionReport;
  }

  /**
   * Retrieves condition reports for a specific resource or booking.
   */
  static async getReports(params: {
    resourceId?: string;
    bookingId?: string;
  }): Promise<ConditionReport[]> {
    const admin = createAdminClient();
    let query = admin
      .from('condition_reports')
      .select('*, reporter:profiles!reporter_id(full_name, role)')
      .order('created_at', { ascending: false });

    if (params.resourceId) {
      query = query.eq('resource_id', params.resourceId);
    }

    if (params.bookingId) {
      query = query.eq('booking_id', params.bookingId);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to fetch condition reports: ${error.message}`);
    }

    return (data || []) as unknown as ConditionReport[];
  }
}
