import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gzip/deflate responses served by Next (safe, no behavioural change)
  compress: true,
  // Don't advertise the framework in a response header
  poweredByHeader: false,
  // Skip generating browser source maps in production for smaller/faster builds
  productionBrowserSourceMaps: false,
  experimental: {
    // Tree-shake named imports from these packages to shrink client bundles
    optimizePackageImports: ['@supabase/supabase-js', '@supabase/ssr'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { 
            key: 'Content-Security-Policy', 
            // Allow Supabase API (connect-src) and Storage (img-src) to prevent breaking functionality
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co; connect-src 'self' https://*.supabase.co wss://*.supabase.co; font-src 'self' data:;"
          },
        ],
      }
    ]
  }
};

export default nextConfig;
