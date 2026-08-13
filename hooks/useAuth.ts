import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { UserProfile } from '@/lib/database.types'

export function useAuth() {
  const supabase = createClient()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = async (userId: string) => {
    console.log('useAuth: fetchProfile called for', userId);
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*, sites(name, company)')
        .eq('id', userId)
        .single()
        
      console.log('useAuth: fetchProfile returned', { hasData: !!data, error });
      setProfile(data)
    } catch (e) {
      console.log('useAuth: fetchProfile threw', e);
    }
  }

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await fetchProfile(user.id)
      }
      setLoading(false)
    }
    init()

    // Listen to ALL auth state changes (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, etc.)
    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        await fetchProfile(session.user.id)
      } else if (event === 'SIGNED_OUT') {
        setProfile(null)
      }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const login = async (username: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })

    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error || 'Incorrect username or password')
    }

    if (data.session) {
      console.log('useAuth: Calling setSession...');
      await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token
      })
      console.log('useAuth: setSession resolved!');
    }
    // profile will be set automatically by the onAuthStateChange → SIGNED_IN handler
  }

  const logout = async () => {
    await supabase.auth.signOut()
    setProfile(null)
    window.location.href = '/login'
  }

  return { profile, loading, login, logout }
}
