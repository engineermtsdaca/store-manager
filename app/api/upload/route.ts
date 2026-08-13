import { createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/upload — returns signed upload URL
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { bucket, path } = await req.json()

  const ALLOWED_BUCKETS = ['proformas', 'receipts', 'screenshots', 'avatars']
  if (!ALLOWED_BUCKETS.includes(bucket)) {
    return NextResponse.json({ error: 'Forbidden bucket' }, { status: 403 })
  }
  if (!path || path.includes('..') || path.includes('/')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  // SECURITY (MED-02): Enforce strict file extension allowlist to prevent XSS / malicious uploads
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.pdf', '.webp']
  const lowerPath = path.toLowerCase()
  const hasValidExtension = allowedExtensions.some(ext => lowerPath.endsWith(ext))
  
  if (!hasValidExtension) {
    return NextResponse.json({ error: 'Invalid file type. Only JPG, PNG, PDF, and WEBP are allowed.' }, { status: 400 })
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(path)

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ signed_url: data.signedUrl, token: data.token, path })
}
