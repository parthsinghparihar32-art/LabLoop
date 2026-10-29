import { NextRequest } from 'next/server';
import { BookingService } from '@/lib/services/booking.service';
import { AuthService } from '@/lib/services/auth.service';
import { uuidSchema, bookingDecisionSchema } from '@/lib/validations';
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
      const parsed = bookingDecisionSchema.parse(body);
      reason = parsed.reason;
    } catch {
      // Body is optional
    }

    const rejected = await BookingService.rejectBooking(
      bookingId,
      profile.id,
      profile.role === 'admin',
      reason
    );

    return successResponse(rejected);
  } catch (error) {
    return errorResponse(error);
  }
}
