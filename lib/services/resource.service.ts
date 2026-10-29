import { createAdminClient } from '@/lib/supabase/admin';
import type { Resource, ResourceCategory, ResourceStatus } from '@/lib/types/models';
import { NotFoundError, AuthorizationError } from '@/lib/types/api';
import { AuditService } from './audit.service';

export class ResourceService {
  /**
   * Retrieves resources with filtering, searching, and pagination.
   */
  static async listResources(params: {
    category?: ResourceCategory;
    status?: ResourceStatus;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ resources: Resource[]; total: number }> {
    const admin = createAdminClient();
    const page = params.page || 1;
    const limit = params.limit || 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = admin
      .from('resources')
      .select('*, owner:profiles!owner_id(full_name, department, role)', { count: 'exact' });

    if (params.category) {
      query = query.eq('category', params.category);
    }

    if (params.status) {
      query = query.eq('status', params.status);
    } else {
      query = query.in('status', ['available', 'maintenance']);
    }

    if (params.search) {
      query = query.or(`name.ilike.%${params.search}%,description.ilike.%${params.search}%,location.ilike.%${params.search}%`);
    }

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, count, error } = await query;

    if (error) {
      throw new Error(`Failed to list resources: ${error.message}`);
    }

    return {
      resources: (data || []) as unknown as Resource[],
      total: count || 0,
    };
  }

  /**
   * Retrieves a single resource by ID.
   */
  static async getResourceById(id: string): Promise<Resource> {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('resources')
      .select('*, owner:profiles!owner_id(full_name, department, role)')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundError('Resource');
    }

    return data as unknown as Resource;
  }

  /**
   * Creates a new resource in the catalogue.
   */
  static async createResource(
    ownerId: string,
    data: {
      name: string;
      category: ResourceCategory;
      description: string;
      location: string;
      credit_rate: number;
      status?: ResourceStatus;
      requires_credential?: string | null;
      specifications?: Record<string, unknown>;
      image_url?: string | null;
    }
  ): Promise<Resource> {
    const admin = createAdminClient();

    const { data: created, error } = await admin
      .from('resources')
      .insert({
        owner_id: ownerId,
        name: data.name,
        category: data.category,
        description: data.description,
        location: data.location,
        credit_rate: data.credit_rate,
        status: data.status || 'available',
        requires_credential: data.requires_credential || null,
        specifications: (data.specifications || {}) as any,
        image_url: data.image_url || null,
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to create resource: ${error.message}`);
    }

    await AuditService.logEvent({
      actorId: ownerId,
      action: 'resource.created',
      entityType: 'resources',
      entityId: created.id,
      metadata: {
        name: data.name,
        category: data.category,
        credit_rate: data.credit_rate,
      },
    });

    return created as unknown as Resource;
  }

  /**
   * Updates an existing resource.
   */
  static async updateResource(
    id: string,
    actorId: string,
    isActorAdmin: boolean,
    data: Partial<Resource>
  ): Promise<Resource> {
    const admin = createAdminClient();
    const existing = await this.getResourceById(id);

    if (existing.owner_id !== actorId && !isActorAdmin) {
      throw new AuthorizationError('You do not have permission to modify this resource');
    }

    const { data: updated, error } = await admin
      .from('resources')
      .update({
        ...(data.name && { name: data.name }),
        ...(data.category && { category: data.category }),
        ...(data.description && { description: data.description }),
        ...(data.location && { location: data.location }),
        ...(data.credit_rate !== undefined && { credit_rate: data.credit_rate }),
        ...(data.status && { status: data.status }),
        ...(data.requires_credential !== undefined && { requires_credential: data.requires_credential }),
        ...(data.specifications && { specifications: data.specifications as any }),
        ...(data.image_url !== undefined && { image_url: data.image_url }),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to update resource: ${error.message}`);
    }

    await AuditService.logEvent({
      actorId,
      action: 'resource.updated',
      entityType: 'resources',
      entityId: id,
      metadata: { changes: Object.keys(data) },
    });

    return updated as unknown as Resource;
  }
}
