import { NextRequest } from 'next/server';
import { IncidentService } from '@/lib/services/incident.service';
import { AuthService } from '@/lib/services/auth.service';
import { createIncidentSchema, incidentStatusSchema } from '@/lib/validations';
import { successResponse, errorResponse } from '@/lib/utils/api-handler';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await AuthService.requireAuth();
    const resourceId = request.nextUrl.searchParams.get('resource_id') || undefined;
    const rawStatus = request.nextUrl.searchParams.get('status');
    const status = rawStatus ? incidentStatusSchema.parse(rawStatus) : undefined;

    const incidents = await IncidentService.listIncidents({ resourceId, status });
    return successResponse(incidents);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await AuthService.requireAuth();
    const body = await request.json();
    const validatedData = createIncidentSchema.parse(body);

    const incident = await IncidentService.reportIncident(profile.id, validatedData);
    return successResponse(incident, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
