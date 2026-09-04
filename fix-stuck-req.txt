const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY // Actually we need service_role, let's check .env.local
);

async function run() {
  const { data, error } = await supabase
    .from('material_requests')
    .delete()
    .eq('item', 'cement7');
    
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Successfully deleted stuck cement7 request:', data);
  }
}

run();
