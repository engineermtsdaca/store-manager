import { NextResponse } from 'next/server';

// SECURITY: This endpoint previously read .env.local from disk and executed raw SQL
// migration files against the database with no authentication. It has been disabled.
// Run migrations via the Supabase Dashboard / CLI instead. Kept as a 404 stub to
// avoid breaking any build/import references.
export async function GET() {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
