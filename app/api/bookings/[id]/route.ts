import { NextRequest } from 'next/server';
import { BookingService } from '@/lib/services/booking.service';
import { AuthService } from '@/lib/services/auth.service';
import { uuidSchema } from '@/lib/validations';
import { successResponse, errorResponse } from '@/lib/utils/api-handler';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const bookingId = uuidSchema.parse(params.id);
    const profile = await AuthService.requireAuth();

    const booking = await BookingService.getBookingById(bookingId, profile.id, profile.role);
    return successResponse(booking);
  } catch (error) {
    return errorResponse(error);
  }
}
