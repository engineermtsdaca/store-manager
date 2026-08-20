import { NextResponse } from 'next/server';

// SECURITY: This endpoint previously leaked which SUPABASE_* environment variables
// exist. It has been disabled. Kept as a 404 stub to avoid breaking build references.
export async function GET() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
