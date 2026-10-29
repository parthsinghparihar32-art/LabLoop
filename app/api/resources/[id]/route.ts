import { NextRequest } from 'next/server';
import { ResourceService } from '@/lib/services/resource.service';
import { AuthService } from '@/lib/services/auth.service';
import { updateResourceSchema, uuidSchema } from '@/lib/validations';
import { successResponse, errorResponse } from '@/lib/utils/api-handler';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const resourceId = uuidSchema.parse(params.id);
    const resource = await ResourceService.getResourceById(resourceId);
    return successResponse(resource);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const resourceId = uuidSchema.parse(params.id);
    const profile = await AuthService.requireAuth();
    const body = await request.json();
    const validatedData = updateResourceSchema.parse(body);

    const updated = await ResourceService.updateResource(
      resourceId,
      profile.id,
      profile.role === 'admin',
      validatedData
    );

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const resourceId = uuidSchema.parse(params.id);
    const profile = await AuthService.requireAuth();

    const retired = await ResourceService.updateResource(
      resourceId,
      profile.id,
      profile.role === 'admin',
      { status: 'retired' }
    );

    return successResponse(retired);
  } catch (error) {
    return errorResponse(error);
  }
}
