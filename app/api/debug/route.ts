import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
    try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        
        let dbClient;
        let mode = 'anon';
        
        if (serviceKey) {
            dbClient = createClient(url, serviceKey);
            mode = 'service_role';
        } else {
            dbClient = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
        }

        const { data: pos, error } = await dbClient.from('purchase_orders').select('*');

        return NextResponse.json({
            success: true,
            mode,
            hasServiceKey: !!serviceKey,
            pos
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
