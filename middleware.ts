import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const MAX_REQUESTS_PER_WINDOW = 100; // 100 requests per minute
const RATE_LIMIT_WINDOW_SECONDS = 60; // 1 minute

export async function middleware(request: NextRequest) {
  // --- Rate Limiting Logic (Supabase DB-Backed) ---
  // Get client IP from headers (request.ip is not available in Next.js App Router)
  const rawIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown-ip';
  const ip = rawIp.split(',')[0].trim(); // Safely get the first IP in the chain

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  // If Supabase URL is placeholder or unconfigured, allow browsing in demo mode
  if (!supabaseUrl || supabaseUrl.includes('your-project.supabase.co')) {
    return NextResponse.next()
  }

  // Only apply rate limiting if we have the service key (e.g. in production)
  // and the IP is not localhost
  if (supabaseServiceKey && ip !== 'unknown-ip' && !ip.includes('127.0.0.1') && ip !== '::1') {
    try {
      const adminSupabase = createAdminClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false }
      })

      const { data: allowed, error } = await adminSupabase.rpc('check_rate_limit', {
        p_ip: ip,
        p_max_requests: MAX_REQUESTS_PER_WINDOW,
        p_window_seconds: RATE_LIMIT_WINDOW_SECONDS
      })

      if (error) {
        console.error('Rate limit error:', error)
        // Fail-open (allow request) if DB fails so we don't bring down the app
      } else if (allowed === false) {
        if (request.nextUrl.pathname.startsWith('/api')) {
          return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }
        return new NextResponse('Too many requests, please try again later.', { status: 429 });
      }
    } catch (e) {
      console.error('Rate limit exception:', e)
    }
  }
  // ---------------------------
  // --- CSRF Protection (MED-01) ---
  const isApiRequest = request.nextUrl.pathname.startsWith('/api')
  const isWebhook = request.nextUrl.pathname.startsWith('/api/telegram-webhook')
  const isStateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)

  if (isApiRequest && !isWebhook && isStateChanging) {
    const origin = request.headers.get('origin')
    const referer = request.headers.get('referer')
    const host = request.headers.get('host')

    let isValidCsrf = false

    if (origin) {
      try {
        const originUrl = new URL(origin)
        if (originUrl.host === host) isValidCsrf = true
      } catch (e) {}
    } else if (referer) {
      try {
        const refererUrl = new URL(referer)
        if (refererUrl.host === host) isValidCsrf = true
      } catch (e) {}
    }

    if (host && (host.includes('127.0.0.1') || host.includes('localhost') || host.includes('host.docker.internal'))) {
      isValidCsrf = true;
    }

    if (!isValidCsrf) {
      return NextResponse.json({ error: 'CSRF Validation Failed' }, { status: 403 })
    }
  }
  // ---------------------------

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  try {
    const supabase = createServerClient(
      supabaseUrl,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            request.cookies.set({ name, value, ...options })
            response = NextResponse.next({
              request: {
                headers: request.headers,
              },
            })
            response.cookies.set({ name, value, ...options })
          },
          remove(name: string, options: any) {
            request.cookies.set({ name, value: '', ...options })
            response = NextResponse.next({
              request: {
                headers: request.headers,
              },
            })
            response.cookies.set({ name, value: '', ...options })
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()

    // Enforce auth for both pages and APIs (LOW-02)
    const isPublicRoute = request.nextUrl.pathname.startsWith('/login') || 
                          request.nextUrl.pathname.startsWith('/api/auth/login') ||
                          request.nextUrl.pathname.startsWith('/api/auth/forgot-password') ||
                          request.nextUrl.pathname.startsWith('/api/auth/reset-password') ||
                          request.nextUrl.pathname.startsWith('/api/debug') ||
                          request.nextUrl.pathname.startsWith('/api/internal/poll-messages');
                          
    if (!user && !isPublicRoute) {
      if (request.nextUrl.pathname.startsWith('/api')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      return NextResponse.redirect(new URL('/login', request.url))
    }
  } catch (err) {
    // Fail-closed on error (LOW-01)
    const isPublicRoute = request.nextUrl.pathname.startsWith('/login') || 
                          request.nextUrl.pathname.startsWith('/api/auth/login') ||
                          request.nextUrl.pathname.startsWith('/api/auth/forgot-password') ||
                          request.nextUrl.pathname.startsWith('/api/auth/reset-password') ||
                          request.nextUrl.pathname.startsWith('/api/debug') ||
                          request.nextUrl.pathname.startsWith('/api/internal/poll-messages');
                          
    if (!isPublicRoute) {
      if (request.nextUrl.pathname.startsWith('/api')) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
      }
      return NextResponse.redirect(new URL('/login', request.url))
    }
    return NextResponse.next()
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
