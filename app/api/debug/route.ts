import { NextResponse } from 'next/server';

// SECURITY: This debug endpoint previously exposed all purchase_orders using the
// service-role key with no authentication. It has been disabled. Do not re-enable
// in production. Kept as a 404 stub to avoid breaking any build/import references.
export async function GET() {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
