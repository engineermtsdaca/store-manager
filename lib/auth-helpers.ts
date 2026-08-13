import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from './database.types'

export async function requireRole(
  supabase: SupabaseClient<Database>,
  userId: string,
  allowedRoles: string[],
  targetSiteId?: string | null
) {
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, site_id')
    .eq('id', userId)
    .single()

  if (!profile) {
    return { authorized: false, error: 'Profile not found' }
  }

  if (!allowedRoles.includes(profile.role)) {
    return { authorized: false, error: 'Insufficient permissions' }
  }

  // If a target site is provided and the user is bound to a specific site, they must match.
  // Users with profile.site_id = null (like CEOs or general Managers) bypass this check.
  if (targetSiteId && profile.site_id && profile.site_id !== targetSiteId) {
    return { authorized: false, error: 'Access denied to this site' }
  }

  return { authorized: true, profile }
}
