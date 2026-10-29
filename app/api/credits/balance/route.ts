import { NextRequest } from 'next/server';
import { CreditService } from '@/lib/services/credit.service';
import { AuthService } from '@/lib/services/auth.service';
import { successResponse, errorResponse } from '@/lib/utils/api-handler';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const profile = await AuthService.requireAuth();
    const balance = await CreditService.getBalance(profile.id);
    return successResponse({ user_id: profile.id, balance });
  } catch (error) {
    return errorResponse(error);
  }
}
