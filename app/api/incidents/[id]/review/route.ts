import { NextRequest } from 'next/server';
import { IncidentService } from '@/lib/services/incident.service';
import { AuthService } from '@/lib/services/auth.service';
import { uuidSchema, reviewIncidentSchema } from '@/lib/validations';
import { successResponse, errorResponse } from '@/lib/utils/api-handler';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const incidentId = uuidSchema.parse(params.id);
    const profile = await AuthService.requireRole(['verifier', 'admin']);
    const body = await request.json();
    const validatedData = reviewIncidentSchema.parse(body);

    const reviewed = await IncidentService.reviewIncident(
      incidentId,
      profile.id,
      validatedData
    );

    return successResponse(reviewed);
  } catch (error) {
    return errorResponse(error);
  }
}
