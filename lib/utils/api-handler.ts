import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AppError } from '@/lib/types/api';

/**
 * Standardized success response helper.
 */
export function successResponse<T>(data: T, status = 200, metadata?: Record<string, unknown>) {
  return NextResponse.json(
    {
      success: true,
      data,
      metadata: {
        timestamp: new Date().toISOString(),
        ...metadata,
      },
    },
    { status }
  );
}

/**
 * Standardized error response helper.
 * Masks internal stack traces and server errors from clients.
 */
export function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: error.flatten().fieldErrors,
        },
      },
      { status: 400 }
    );
  }

  if (error instanceof AppError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
      { status: error.statusCode }
    );
  }

  // Allow Next.js internal dynamic server usage exceptions to propagate
  if (typeof error === 'object' && error !== null && 'digest' in error && (error as any).digest === 'DYNAMIC_SERVER_USAGE') {
    throw error;
  }

  // Fallback for unhandled unexpected server errors
  console.error('[LabLoop Internal Server Error]:', error);
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected internal error occurred. Please try again later.',
      },
    },
    { status: 500 }
  );
}
