import { NextRequest } from 'next/server';
import { CreditService } from '@/lib/services/credit.service';
import { AuthService } from '@/lib/services/auth.service';
import { successResponse, errorResponse } from '@/lib/utils/api-handler';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const profile = await AuthService.requireAuth();
    const page = Number(request.nextUrl.searchParams.get('page')) || 1;
    const limit = Number(request.nextUrl.searchParams.get('limit')) || 20;

    const result = await CreditService.getHistory(profile.id, page, limit);
    return successResponse(result.entries, 200, {
      total: result.total,
      page,
      pageSize: limit,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
