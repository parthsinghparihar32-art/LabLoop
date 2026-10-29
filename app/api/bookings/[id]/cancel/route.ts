import { NextRequest } from 'next/server';
import { BookingService } from '@/lib/services/booking.service';
import { AuthService } from '@/lib/services/auth.service';
import { uuidSchema, cancelBookingSchema } from '@/lib/validations';
import { successResponse, errorResponse } from '@/lib/utils/api-handler';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const bookingId = uuidSchema.parse(params.id);
    const profile = await AuthService.requireAuth();

    let reason: string | undefined;
    try {
      const body = await request.json();
      const parsed = cancelBookingSchema.parse(body);
      reason = parsed.reason;
    } catch {
      // Body is optional
    }

    const cancelled = await BookingService.cancelBooking(
      bookingId,
      profile.id,
      profile.role === 'admin',
      reason
    );

    return successResponse(cancelled);
  } catch (error) {
    return errorResponse(error);
  }
}
