import { createAdminClient } from '@/lib/supabase/admin';
import type { AuditLog } from '@/lib/types/models';

export class AuditService {
  /**
   * Logs a tamper-resistant security audit event.
   */
  static async logEvent(params: {
    actorId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
    ipAddress?: string | null;
  }): Promise<string> {
    const admin = createAdminClient();

    const { data, error } = await admin.rpc('log_audit_event', {
      p_actor_id: params.actorId || null,
      p_action: params.action,
      p_entity_type: params.entityType,
      p_entity_id: params.entityId || null,
      p_metadata: (params.metadata || {}) as any,
    });

    if (error) {
      // Fallback direct insert via admin if RPC not available
      const { data: fallbackData } = await admin
        .from('audit_logs')
        .insert({
          actor_id: params.actorId || null,
          action: params.action,
          entity_type: params.entityType,
          entity_id: params.entityId || null,
          metadata: (params.metadata || {}) as any,
          ip_address: params.ipAddress || null,
        } as any)
        .select('id')
        .single();

      return fallbackData?.id || '';
    }

    return data || '';
  }

  /**
   * Retrieves audit logs with pagination (admin only).
   */
  static async listLogs(page = 1, limit = 50): Promise<{ logs: AuditLog[]; total: number }> {
    const admin = createAdminClient();
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, count, error } = await admin
      .from('audit_logs')
      .select('*, actor:profiles(*)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(`Failed to retrieve audit logs: ${error.message}`);
    }

    return {
      logs: (data || []) as unknown as AuditLog[],
      total: count || 0,
    };
  }
}
