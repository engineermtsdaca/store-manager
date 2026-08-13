import { NextResponse } from 'next/server';
export async function GET() {
  return NextResponse.json({
    hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    keys: Object.keys(process.env).filter(k => k.includes('SUPABASE'))
  });
}
