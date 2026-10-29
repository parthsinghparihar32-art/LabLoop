import { NextRequest } from 'next/server';
import { ResourceService } from '@/lib/services/resource.service';
import { AuthService } from '@/lib/services/auth.service';
import { createResourceSchema, queryResourceSchema } from '@/lib/validations';
import { successResponse, errorResponse } from '@/lib/utils/api-handler';

export async function GET(request: NextRequest) {
  try {
    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const validatedQuery = queryResourceSchema.parse(searchParams);

    const result = await ResourceService.listResources({
      category: validatedQuery.category,
      status: validatedQuery.status,
      search: validatedQuery.search,
      page: validatedQuery.page,
      limit: validatedQuery.limit,
    });

    return successResponse(result.resources, 200, {
      total: result.total,
      page: validatedQuery.page,
      pageSize: validatedQuery.limit,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await AuthService.requireRole(['resource_owner', 'admin']);
    const body = await request.json();
    const validatedData = createResourceSchema.parse(body);

    const resource = await ResourceService.createResource(profile.id, validatedData);
    return successResponse(resource, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
