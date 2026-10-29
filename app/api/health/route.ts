import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    service: 'LabLoop Backend & Database API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    core_tables: [
      'profiles',
      'resources',
      'bookings',
      'credentials',
      'credit_ledger',
      'condition_reports',
      'incidents',
      'audit_logs',
    ],
  });
}
