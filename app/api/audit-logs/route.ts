import { NextRequest } from 'next/server';
import { AuditService } from '@/lib/services/audit.service';
import { AuthService } from '@/lib/services/auth.service';
import { successResponse, errorResponse } from '@/lib/utils/api-handler';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await AuthService.requireRole(['admin']);
    const page = Number(request.nextUrl.searchParams.get('page')) || 1;
    const limit = Number(request.nextUrl.searchParams.get('limit')) || 50;

    const result = await AuditService.listLogs(page, limit);
    return successResponse(result.logs, 200, {
      total: result.total,
      page,
      pageSize: limit,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
