const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf-8').split('\n').reduce((acc, line) => {
  const [k, v] = line.split('=');
  if (k && v) acc[k.trim()] = v.trim();
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  const users = [
    { u: 'eng1', p: '87654321' },
    { u: 'eng1', p: '123456' },
    { u: 'sk1', p: '887654321' },
    { u: 'sk1', p: '123456' },
    { u: 'sc1', p: '123456' }
  ];
  
  for (const {u, p} of users) {
    const email = `${u}@cappadocia.internal`;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: p });
    if (error) {
      console.log(`Failed for ${u}:${p} -> ${error.message}`);
    } else {
      console.log(`SUCCESS for ${u}:${p}`);
    }
  }
}
test();
