import { NextRequest } from 'next/server';
import { CreditService } from '@/lib/services/credit.service';
import { AuthService } from '@/lib/services/auth.service';
import { grantCreditSchema } from '@/lib/validations';
import { successResponse, errorResponse } from '@/lib/utils/api-handler';

export async function POST(request: NextRequest) {
  try {
    const admin = await AuthService.requireRole(['admin']);
    const body = await request.json();
    const validatedData = grantCreditSchema.parse(body);

    const transactionId = await CreditService.grantCredits({
      userId: validatedData.user_id,
      amount: validatedData.amount,
      description: validatedData.description,
      idempotencyKey: validatedData.idempotency_key,
      adminId: admin.id,
    });

    return successResponse({ transaction_id: transactionId }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
