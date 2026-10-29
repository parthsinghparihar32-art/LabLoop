import { createAdminClient } from '@/lib/supabase/admin';
import type { Incident, IncidentSeverity, IncidentStatus } from '@/lib/types/models';
import { NotFoundError, AuthorizationError } from '@/lib/types/api';
import { AuditService } from './audit.service';

export class IncidentService {
  /**
   * Reports an equipment problem or safety incident.
   */
  static async reportIncident(
    reporterId: string,
    data: {
      resource_id: string;
      booking_id?: string | null;
      severity: IncidentSeverity;
      description: string;
    }
  ): Promise<Incident> {
    const admin = createAdminClient();

    const { data: created, error } = await admin
      .from('incidents')
      .insert({
        resource_id: data.resource_id,
        booking_id: data.booking_id || null,
        reporter_id: reporterId,
        severity: data.severity,
        description: data.description,
        status: 'open',
      })
      .select('*, reporter:profiles!reporter_id(full_name, role)')
      .single();

    if (error) {
      throw new Error(`Failed to report incident: ${error.message}`);
    }

    await AuditService.logEvent({
      actorId: reporterId,
      action: 'incident.reported',
      entityType: 'incidents',
      entityId: created.id,
      metadata: {
        resource_id: data.resource_id,
        severity: data.severity,
      },
    });

    return created as unknown as Incident;
  }

  /**
   * Reviews and updates an incident resolution.
   */
  static async reviewIncident(
    incidentId: string,
    reviewerId: string,
    data: {
      status: IncidentStatus;
      resolution_notes: string;
    }
  ): Promise<Incident> {
    const admin = createAdminClient();

    const { data: existing, error: fetchError } = await admin
      .from('incidents')
      .select('*, resource:resources(*)')
      .eq('id', incidentId)
      .single();

    if (fetchError || !existing) {
      throw new NotFoundError('Incident');
    }

    const { data: updated, error: updateError } = await admin
      .from('incidents')
      .update({
        status: data.status,
        reviewed_by: reviewerId,
        resolution_notes: data.resolution_notes,
      })
      .eq('id', incidentId)
      .select('*, reporter:profiles!reporter_id(*), reviewer:profiles!reviewed_by(*)')
      .single();

    if (updateError) {
      throw new Error(`Failed to review incident: ${updateError.message}`);
    }

    await AuditService.logEvent({
      actorId: reviewerId,
      action: `incident.${data.status}`,
      entityType: 'incidents',
      entityId: incidentId,
      metadata: {
        new_status: data.status,
      },
    });

    return updated as unknown as Incident;
  }

  /**
   * Retrieves incidents with optional filtering.
   */
  static async listIncidents(params: {
    resourceId?: string;
    status?: IncidentStatus;
  }): Promise<Incident[]> {
    const admin = createAdminClient();
    let query = admin
      .from('incidents')
      .select('*, reporter:profiles!reporter_id(full_name, role), reviewer:profiles!reviewed_by(full_name, role)')
      .order('created_at', { ascending: false });

    if (params.resourceId) {
      query = query.eq('resource_id', params.resourceId);
    }

    if (params.status) {
      query = query.eq('status', params.status);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to list incidents: ${error.message}`);
    }

    return (data || []) as unknown as Incident[];
  }
}
