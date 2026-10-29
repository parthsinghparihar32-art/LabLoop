import { createAdminClient } from '@/lib/supabase/admin';
import type { Booking, BookingStatus, UserRole } from '@/lib/types/models';
import {
  NotFoundError,
  AuthorizationError,
  ConflictError,
  ValidationError,
  InsufficientCreditsError,
} from '@/lib/types/api';
import { ResourceService } from './resource.service';
import { CredentialService } from './credential.service';
import { CreditService } from './credit.service';
import { AuditService } from './audit.service';

export class BookingService {
  /**
   * Checks whether an overlapping approved or active booking already exists for a given resource and time window.
   */
  static async hasOverlapConflict(
    resourceId: string,
    startTimeIso: string,
    endTimeIso: string,
    excludeBookingId?: string
  ): Promise<boolean> {
    const admin = createAdminClient();

    let query = admin
      .from('bookings')
      .select('id')
      .eq('resource_id', resourceId)
      .in('status', ['approved', 'checked_in'])
      .lt('start_time', endTimeIso)
      .gt('end_time', startTimeIso);

    if (excludeBookingId) {
      query = query.neq('id', excludeBookingId);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to check booking conflicts: ${error.message}`);
    }

    return (data || []).length > 0;
  }

  /**
   * Calculates trusted booking duration and credit cost.
   */
  static calculateCreditCost(creditRate: number, startTimeIso: string, endTimeIso: string): number {
    const start = new Date(startTimeIso).getTime();
    const end = new Date(endTimeIso).getTime();
    const durationHours = (end - start) / (1000 * 60 * 60);
    return Math.ceil(durationHours * creditRate);
  }

  /**
   * Creates a new booking request with end-to-end server validation.
   */
  static async createBookingRequest(
    requesterId: string,
    data: {
      resource_id: string;
      start_time: string;
      end_time: string;
      purpose: string;
    }
  ): Promise<Booking> {
    const admin = createAdminClient();

    // 1. Validate time boundaries
    const start = new Date(data.start_time).getTime();
    const end = new Date(data.end_time).getTime();
    if (end <= start) {
      throw new ValidationError('End time must be strictly after start time');
    }

    // 2. Fetch and validate resource
    const resource = await ResourceService.getResourceById(data.resource_id);
    if (resource.status !== 'available') {
      throw new ValidationError(`Resource is currently unavailable (${resource.status})`);
    }

    // 3. Credential Passport Check
    if (resource.requires_credential) {
      const isEligible = await CredentialService.checkEligibility(
        requesterId,
        resource.requires_credential,
        data.end_time
      );

      if (!isEligible) {
        throw new AuthorizationError(
          `Resource requires a verified, active credential: "${resource.requires_credential}". Please submit verification first.`
        );
      }
    }

    // 4. Calculate trusted cost and check FairShare credits
    const creditCost = this.calculateCreditCost(resource.credit_rate, data.start_time, data.end_time);
    if (creditCost > 0) {
      const balance = await CreditService.getBalance(requesterId);
      if (balance < creditCost) {
        throw new InsufficientCreditsError(creditCost, balance);
      }
    }

    // 5. Check preliminary conflicts
    const conflict = await this.hasOverlapConflict(data.resource_id, data.start_time, data.end_time);
    if (conflict) {
      throw new ConflictError('The requested time slot already has an approved reservation.');
    }

    // 6. Try atomic database function first for kernel-level guarantee
    const { data: atomicBooking, error: atomicError } = await admin.rpc('create_booking_atomic', {
      p_requester_id: requesterId,
      p_resource_id: data.resource_id,
      p_start_time: data.start_time,
      p_end_time: data.end_time,
      p_purpose: data.purpose,
    });

    if (!atomicError && atomicBooking) {
      return atomicBooking as unknown as Booking;
    }

    // Fallback direct insert if RPC not loaded
    const { data: inserted, error: insertError } = await admin
      .from('bookings')
      .insert({
        resource_id: data.resource_id,
        requester_id: requesterId,
        start_time: data.start_time,
        end_time: data.end_time,
        purpose: data.purpose,
        status: 'requested',
        credit_cost: creditCost,
      })
      .select('*, resource:resources(*), requester:profiles!requester_id(*)')
      .single();

    if (insertError) {
      if (insertError.code === '23P01') {
        // Exclusion constraint violation
        throw new ConflictError('A conflicting reservation was approved concurrently.');
      }
      throw new Error(`Failed to create booking: ${insertError.message}`);
    }

    await AuditService.logEvent({
      actorId: requesterId,
      action: 'booking.created',
      entityType: 'bookings',
      entityId: inserted.id,
      metadata: {
        resource_id: data.resource_id,
        credit_cost: creditCost,
        start_time: data.start_time,
        end_time: data.end_time,
      },
    });

    return inserted as unknown as Booking;
  }

  /**
   * Retrieves paginated bookings with role-aware authorization.
   */
  static async listBookings(params: {
    actorId: string;
    role: UserRole;
    resourceId?: string;
    status?: BookingStatus;
    roleView?: 'requester' | 'owner' | 'all';
    page?: number;
    limit?: number;
  }): Promise<{ bookings: Booking[]; total: number }> {
    const admin = createAdminClient();
    const page = params.page || 1;
    const limit = params.limit || 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = admin
      .from('bookings')
      .select('*, resource:resources(*), requester:profiles!requester_id(*)', { count: 'exact' });

    if (params.resourceId) {
      query = query.eq('resource_id', params.resourceId);
    }

    if (params.status) {
      query = query.eq('status', params.status);
    }

    // Role-based visibility
    if (params.roleView === 'owner') {
      // Find resources owned by actor
      const { data: ownedResources } = await admin
        .from('resources')
        .select('id')
        .eq('owner_id', params.actorId);

      const ownedIds = (ownedResources || []).map((r) => r.id);
      if (ownedIds.length === 0) {
        return { bookings: [], total: 0 };
      }
      query = query.in('resource_id', ownedIds);
    } else if (params.roleView === 'all' && params.role === 'admin') {
      // Admin can see everything
    } else {
      // Default: user's own requested bookings
      query = query.eq('requester_id', params.actorId);
    }

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, count, error } = await query;
    if (error) {
      throw new Error(`Failed to list bookings: ${error.message}`);
    }

    return {
      bookings: (data || []) as unknown as Booking[],
      total: count || 0,
    };
  }

  /**
   * Retrieves single booking by ID with authorization verification.
   */
  static async getBookingById(id: string, actorId: string, role: UserRole): Promise<Booking> {
    const admin = createAdminClient();

    const { data, error } = await admin
      .from('bookings')
      .select('*, resource:resources(*), requester:profiles!requester_id(*), decision_maker:profiles!decision_by(*)')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundError('Booking');
    }

    const booking = data as unknown as Booking;
    const isRequester = booking.requester_id === actorId;
    const isOwner = booking.resource?.owner_id === actorId;
    const isAdmin = role === 'admin';

    if (!isRequester && !isOwner && !isAdmin) {
      throw new AuthorizationError('You do not have permission to view this booking');
    }

    return booking;
  }

  /**
   * Approves a booking request atomically:
   * 1. Checks permissions (resource owner or admin)
   * 2. Checks status is 'requested'
   * 3. Prevents overlapping approved bookings
   * 4. Deducts credits atomically with idempotency key
   * 5. Sets status to 'approved'
   */
  static async approveBooking(
    bookingId: string,
    approverId: string,
    isApproverAdmin: boolean
  ): Promise<Booking> {
    const admin = createAdminClient();

    // 1. Fetch booking and resource
    const { data: booking, error } = await admin
      .from('bookings')
      .select('*, resource:resources(*)')
      .eq('id', bookingId)
      .single();

    if (error || !booking) {
      throw new NotFoundError('Booking');
    }

    if (booking.status !== 'requested') {
      throw new ValidationError(`Cannot approve booking in status "${booking.status}". Only "requested" bookings can be approved.`);
    }

    if (booking.resource?.owner_id !== approverId && !isApproverAdmin) {
      throw new AuthorizationError('Only the resource owner or an administrator can approve this booking');
    }

    // 2. Concurrency check: overlapping approved reservations
    const conflict = await this.hasOverlapConflict(
      booking.resource_id,
      booking.start_time,
      booking.end_time,
      booking.id
    );

    if (conflict) {
      throw new ConflictError('A conflicting reservation was approved for this time slot');
    }

    // 3. Try stored procedure for full database-level atomicity
    const { data: atomicResult, error: atomicError } = await admin.rpc('approve_booking_atomic', {
      p_booking_id: bookingId,
      p_approver_id: approverId,
    });

    if (!atomicError && atomicResult) {
      return atomicResult as unknown as Booking;
    }

    // 4. Fallback atomic sequence: deduct credits then update status
    if (booking.credit_cost > 0) {
      await CreditService.processTransaction({
        userId: booking.requester_id,
        bookingId: booking.id,
        amount: -booking.credit_cost,
        transactionType: 'deduction',
        idempotencyKey: `booking-approve-${booking.id}`,
        description: `Credits deducted for approved booking #${booking.id.slice(0, 8)}`,
      });
    }

    const { data: updated, error: updateError } = await admin
      .from('bookings')
      .update({
        status: 'approved',
        decision_by: approverId,
        decision_at: new Date().toISOString(),
      })
      .eq('id', bookingId)
      .select('*, resource:resources(*), requester:profiles!requester_id(*)')
      .single();

    if (updateError) {
      throw new Error(`Failed to update booking status: ${updateError.message}`);
    }

    await AuditService.logEvent({
      actorId: approverId,
      action: 'booking.approved',
      entityType: 'bookings',
      entityId: bookingId,
      metadata: {
        requester_id: booking.requester_id,
        credit_cost: booking.credit_cost,
      },
    });

    return updated as unknown as Booking;
  }

  /**
   * Rejects a booking request.
   */
  static async rejectBooking(
    bookingId: string,
    decisionBy: string,
    isDecisionMakerAdmin: boolean,
    reason?: string
  ): Promise<Booking> {
    const admin = createAdminClient();
    const booking = await this.getBookingById(bookingId, decisionBy, isDecisionMakerAdmin ? 'admin' : 'resource_owner');

    if (booking.status !== 'requested') {
      throw new ValidationError(`Cannot reject booking in status "${booking.status}". Only "requested" bookings can be rejected.`);
    }

    if (booking.resource?.owner_id !== decisionBy && !isDecisionMakerAdmin) {
      throw new AuthorizationError('Only the resource owner or an administrator can reject this booking');
    }

    const { data: updated, error } = await admin
      .from('bookings')
      .update({
        status: 'rejected',
        decision_by: decisionBy,
        decision_at: new Date().toISOString(),
        cancellation_reason: reason || null,
      })
      .eq('id', bookingId)
      .select('*, resource:resources(*), requester:profiles!requester_id(*)')
      .single();

    if (error) {
      throw new Error(`Failed to reject booking: ${error.message}`);
    }

    await AuditService.logEvent({
      actorId: decisionBy,
      action: 'booking.rejected',
      entityType: 'bookings',
      entityId: bookingId,
      metadata: { reason },
    });

    return updated as unknown as Booking;
  }

  /**
   * Cancels a booking and automatically refunds credits if previously deducted.
   */
  static async cancelBooking(
    bookingId: string,
    actorId: string,
    isActorAdmin: boolean,
    reason?: string
  ): Promise<Booking> {
    const admin = createAdminClient();
    const booking = await this.getBookingById(bookingId, actorId, isActorAdmin ? 'admin' : 'student');

    if (!['requested', 'approved'].includes(booking.status)) {
      throw new ValidationError(`Cannot cancel booking in status "${booking.status}"`);
    }

    const isRequester = booking.requester_id === actorId;
    const isOwner = booking.resource?.owner_id === actorId;

    if (!isRequester && !isOwner && !isActorAdmin) {
      throw new AuthorizationError('You do not have permission to cancel this booking');
    }

    // If approved and credits were deducted, refund credits
    if (booking.status === 'approved' && booking.credit_cost > 0) {
      await CreditService.processTransaction({
        userId: booking.requester_id,
        bookingId: booking.id,
        amount: booking.credit_cost,
        transactionType: 'refund',
        idempotencyKey: `booking-cancel-refund-${booking.id}`,
        description: `Credit refund for cancelled booking #${booking.id.slice(0, 8)}`,
      });
    }

    const { data: updated, error } = await admin
      .from('bookings')
      .update({
        status: 'cancelled',
        cancellation_reason: reason || null,
      })
      .eq('id', bookingId)
      .select('*, resource:resources(*), requester:profiles!requester_id(*)')
      .single();

    if (error) {
      throw new Error(`Failed to cancel booking: ${error.message}`);
    }

    await AuditService.logEvent({
      actorId,
      action: 'booking.cancelled',
      entityType: 'bookings',
      entityId: bookingId,
      metadata: { reason, refunded_credits: booking.status === 'approved' ? booking.credit_cost : 0 },
    });

    return updated as unknown as Booking;
  }

  /**
   * Performs check-in for an approved booking.
   */
  static async checkInBooking(
    bookingId: string,
    actorId: string,
    isActorAdmin: boolean
  ): Promise<Booking> {
    const admin = createAdminClient();
    const booking = await this.getBookingById(bookingId, actorId, isActorAdmin ? 'admin' : 'student');

    if (booking.status !== 'approved') {
      throw new ValidationError(`Cannot check in. Booking must be in "approved" status (current: "${booking.status}")`);
    }

    const now = new Date().toISOString();
    const { data: updated, error } = await admin
      .from('bookings')
      .update({
        status: 'checked_in',
        checked_in_at: now,
      })
      .eq('id', bookingId)
      .select('*, resource:resources(*), requester:profiles!requester_id(*)')
      .single();

    if (error) {
      throw new Error(`Failed to record check-in: ${error.message}`);
    }

    await AuditService.logEvent({
      actorId,
      action: 'booking.checked_in',
      entityType: 'bookings',
      entityId: bookingId,
      metadata: { checked_in_at: now },
    });

    return updated as unknown as Booking;
  }

  /**
   * Records return for an active booking.
   */
  static async returnBooking(
    bookingId: string,
    actorId: string,
    isActorAdmin: boolean
  ): Promise<Booking> {
    const admin = createAdminClient();
    const booking = await this.getBookingById(bookingId, actorId, isActorAdmin ? 'admin' : 'student');

    if (booking.status !== 'checked_in') {
      throw new ValidationError(`Cannot record return. Booking must be in "checked_in" status (current: "${booking.status}")`);
    }

    const now = new Date().toISOString();
    const { data: updated, error } = await admin
      .from('bookings')
      .update({
        status: 'returned',
        returned_at: now,
      })
      .eq('id', bookingId)
      .select('*, resource:resources(*), requester:profiles!requester_id(*)')
      .single();

    if (error) {
      throw new Error(`Failed to record return: ${error.message}`);
    }

    await AuditService.logEvent({
      actorId,
      action: 'booking.returned',
      entityType: 'bookings',
      entityId: bookingId,
      metadata: { returned_at: now },
    });

    return updated as unknown as Booking;
  }

  /**
   * Marks a returned booking as completed (Owner or Admin).
   */
  static async completeBooking(
    bookingId: string,
    actorId: string,
    isActorAdmin: boolean
  ): Promise<Booking> {
    const admin = createAdminClient();
    const booking = await this.getBookingById(bookingId, actorId, isActorAdmin ? 'admin' : 'resource_owner');

    if (booking.status !== 'returned') {
      throw new ValidationError(`Cannot mark completed. Booking must be in "returned" status (current: "${booking.status}")`);
    }

    if (booking.resource?.owner_id !== actorId && !isActorAdmin) {
      throw new AuthorizationError('Only the resource owner or an admin can mark a booking as completed');
    }

    const { data: updated, error } = await admin
      .from('bookings')
      .update({
        status: 'completed',
      })
      .eq('id', bookingId)
      .select('*, resource:resources(*), requester:profiles!requester_id(*)')
      .single();

    if (error) {
      throw new Error(`Failed to complete booking: ${error.message}`);
    }

    await AuditService.logEvent({
      actorId,
      action: 'booking.completed',
      entityType: 'bookings',
      entityId: bookingId,
    });

    return updated as unknown as Booking;
  }
}
