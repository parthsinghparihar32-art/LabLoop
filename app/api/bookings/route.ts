import { NextRequest } from 'next/server';
import { BookingService } from '@/lib/services/booking.service';
import { AuthService } from '@/lib/services/auth.service';
import { createBookingSchema, queryBookingSchema } from '@/lib/validations';
import { successResponse, errorResponse } from '@/lib/utils/api-handler';

export async function GET(request: NextRequest) {
  try {
    const profile = await AuthService.requireAuth();
    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const validatedQuery = queryBookingSchema.parse(searchParams);

    const result = await BookingService.listBookings({
      actorId: profile.id,
      role: profile.role,
      resourceId: validatedQuery.resource_id,
      status: validatedQuery.status,
      roleView: validatedQuery.role_view,
      page: validatedQuery.page,
      limit: validatedQuery.limit,
    });

    return successResponse(result.bookings, 200, {
      total: result.total,
      page: validatedQuery.page,
      pageSize: validatedQuery.limit,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await AuthService.requireAuth();
    const body = await request.json();
    const validatedData = createBookingSchema.parse(body);

    const booking = await BookingService.createBookingRequest(profile.id, validatedData);
    return successResponse(booking, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
