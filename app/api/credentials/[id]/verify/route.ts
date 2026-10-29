import { NextRequest } from 'next/server';
import { CredentialService } from '@/lib/services/credential.service';
import { AuthService } from '@/lib/services/auth.service';
import { uuidSchema, verifyCredentialSchema } from '@/lib/validations';
import { successResponse, errorResponse } from '@/lib/utils/api-handler';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const credentialId = uuidSchema.parse(params.id);
    const verifier = await AuthService.requireRole(['verifier', 'admin']);
    const body = await request.json();
    const validatedData = verifyCredentialSchema.parse(body);

    const verified = await CredentialService.verifyCredential(
      credentialId,
      verifier.id,
      validatedData
    );

    return successResponse(verified);
  } catch (error) {
    return errorResponse(error);
  }
}
