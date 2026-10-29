import { NextRequest } from 'next/server';
import { ConditionService } from '@/lib/services/condition.service';
import { AuthService } from '@/lib/services/auth.service';
import { createConditionReportSchema } from '@/lib/validations';
import { successResponse, errorResponse } from '@/lib/utils/api-handler';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await AuthService.requireAuth();
    const resourceId = request.nextUrl.searchParams.get('resource_id') || undefined;
    const bookingId = request.nextUrl.searchParams.get('booking_id') || undefined;

    const reports = await ConditionService.getReports({ resourceId, bookingId });
    return successResponse(reports);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await AuthService.requireAuth();
    const body = await request.json();
    const validatedData = createConditionReportSchema.parse(body);

    const report = await ConditionService.createReport(profile.id, validatedData);
    return successResponse(report, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
