import { NextRequest } from 'next/server';
import { CredentialService } from '@/lib/services/credential.service';
import { AuthService } from '@/lib/services/auth.service';
import { submitCredentialSchema } from '@/lib/validations';
import { successResponse, errorResponse } from '@/lib/utils/api-handler';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const profile = await AuthService.requireAuth();
    const credentials = await CredentialService.getUserCredentials(profile.id);
    return successResponse(credentials);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await AuthService.requireAuth();
    const body = await request.json();
    const validatedData = submitCredentialSchema.parse(body);

    const credential = await CredentialService.submitCredential(profile.id, validatedData);
    return successResponse(credential, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
