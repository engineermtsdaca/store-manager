import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    return NextResponse.json({ error: 'No service key' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl!, serviceKey);

  // We need to link auth.users to user_profiles
  const { data: usersData } = await supabase.auth.admin.listUsers();
  
  const emailsToFix = ['sk1@cappadocia.internal', 'eng1@cappadocia.internal'];
  
  for (const email of emailsToFix) {
      const user = usersData?.users.find(u => u.email === email);
      if (user) {
          const username = email.split('@')[0].toUpperCase();
          // Find old profile
          const { data: oldProfile } = await supabase.from('user_profiles').select('*').eq('username', username).single();
          if (oldProfile && oldProfile.id !== user.id) {
              console.log(`Fixing ${username}... Old ID: ${oldProfile.id}, New ID: ${user.id}`);
              // Insert new profile
              await supabase.from('user_profiles').insert({
                  id: user.id,
                  username: oldProfile.username,
                  role: oldProfile.role,
                  site_id: oldProfile.site_id,
                  company: oldProfile.company,
                  name_en: oldProfile.name_en,
                  name_am: oldProfile.name_am,
                  signature_url: oldProfile.signature_url
              });
              // Delete old profile
              await supabase.from('user_profiles').delete().eq('id', oldProfile.id);
          }
      }
  }

  return NextResponse.json({ success: true });
}
