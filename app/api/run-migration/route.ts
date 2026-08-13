import { NextResponse } from 'next/server';
import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

export async function GET() {
    try {
        // Read the DB URL from .env.local if available, else construct it
        const envContent = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8');
        const dbUrlMatch = envContent.match(/SUPABASE_DB_URL=(.*)/);
        let connectionString = dbUrlMatch ? dbUrlMatch[1].trim() : '';

        // If they didn't set it, we can't use PG. We must tell the user to run it manually.
        if (!connectionString || connectionString.includes('YOUR_DB_PASSWORD')) {
            return NextResponse.json({ error: 'No DB URL found. Please run the SQL manually in Supabase Dashboard.' });
        }

        const client = new Client({ connectionString });
        await client.connect();

        // 1. Run part 6 to ensure sm1 has Friendship Site
        const part6 = fs.readFileSync(path.join(process.cwd(), 'supabase', 'migrations', '20260808_part6_fix_sm1_site.sql'), 'utf-8');
        await client.query(part6);

        // 2. Run part 7
        const part7 = fs.readFileSync(path.join(process.cwd(), 'supabase', 'migrations', '20260809_part7_fix_proforma_routing.sql'), 'utf-8');
        await client.query(part7);

        await client.end();

        return NextResponse.json({ success: true, message: 'Migrations applied successfully via PG client!' });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
