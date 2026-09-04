const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
    const { data, error } = await supabase.from('action_receipts').select('*').eq('action_type', 'Storekeeper Material Handover').limit(5);
    console.log(JSON.stringify(data, null, 2));
}
run();
