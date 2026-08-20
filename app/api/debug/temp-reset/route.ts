import { NextResponse } from 'next/server';

// SECURITY: This one-off maintenance endpoint previously used the service-role key
// (no authentication) to rewrite and delete user_profiles rows. It has been disabled.
// Kept as a 404 stub to avoid breaking any build/import references.
export async function GET() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
