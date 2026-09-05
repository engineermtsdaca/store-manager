'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuth()

  // --- Login form ---
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // --- Preferences ---
  const [isDarkMode, setIsDarkMode] = useState(true)
  const [language, setLanguage] = useState<'en' | 'am'>('en')

  useEffect(() => {
    (window as any).__TEST_LOGIN = (u: string, p: string) => {
      setUsername(u)
      setPassword(p)
    }
  }, [])

  // ---- Login handler ----
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      window.location.href = '/'
    } catch (err: any) {
      setError(err.message || 'Login failed. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  // ---- Forgot password state ----
  type ForgotStep = 'closed' | 'username' | 'otp' | 'success'
  const [forgotStep, setForgotStep] = useState<ForgotStep>('closed')
  const [fpUsername, setFpUsername] = useState('')
  const [fpOtp, setFpOtp] = useState('')
  const [fpNewPassword, setFpNewPassword] = useState('')
  const [fpConfirmPassword, setFpConfirmPassword] = useState('')
  const [fpLoading, setFpLoading] = useState(false)
  const [fpError, setFpError] = useState('')
  const [fpShowNew, setFpShowNew] = useState(false)
  const [fpShowConfirm, setFpShowConfirm] = useState(false)

  const openForgot = () => {
    setFpUsername(username)
    setFpOtp('')
    setFpNewPassword('')
    setFpConfirmPassword('')
    setFpError('')
    setForgotStep('username')
  }

  const closeForgot = () => setForgotStep('closed')

  const handleForgotRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setFpError('')
    setFpLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: fpUsername }),
      })
      const data = await res.json()
      if (data.error === 'no_telegram') {
        setFpError(
          data.message ||
          'No Telegram linked to this account. Contact your administrator to link your Telegram first.'
        )
        return
      }
      if (!res.ok) throw new Error(data.error || 'Request failed')
      setForgotStep('otp')
    } catch (err: any) {
      setFpError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setFpLoading(false)
    }
  }

  const handleForgotReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setFpError('')
    if (fpNewPassword !== fpConfirmPassword) {
      setFpError('Passwords do not match')
      return
    }
    if (fpNewPassword.length < 8) {
      setFpError('Password must be at least 8 characters')
      return
    }
    setFpLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: fpUsername, otp: fpOtp, new_password: fpNewPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Reset failed')
      setForgotStep('success')
    } catch (err: any) {
      setFpError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setFpLoading(false)
    }
  }

  // ---- Shared styles ----
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '11px 14px',
    borderRadius: '10px',
    border: isDarkMode ? '1px solid #334155' : '1px solid #cbd5e1',
    backgroundColor: isDarkMode ? '#0f172a' : '#f8fafc',
    color: isDarkMode ? '#f8fafc' : '#0f172a',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '12px',
    fontWeight: 700,
    marginBottom: '6px',
    color: isDarkMode ? '#94a3b8' : '#64748b',
  }
  const btnPrimary: React.CSSProperties = {
    width: '100%',
    padding: '12px',
    borderRadius: '10px',
    border: 'none',
    background: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
    color: '#fff',
    fontWeight: 700,
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
    boxShadow: '0 4px 12px rgba(37,99,235,0.35)',
  }
  const errorStyle: React.CSSProperties = {
    backgroundColor: 'rgba(239,68,68,0.12)',
    border: '1px solid rgba(239,68,68,0.4)',
    color: '#fca5a5',
    padding: '10px 14px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 600,
    marginBottom: '14px',
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isDarkMode ? '#0f172a' : '#f8fafc',
        color: isDarkMode ? '#f8fafc' : '#0f172a',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        backgroundImage: isDarkMode 
          ? 'linear-gradient(rgba(15, 23, 42, 0.4), rgba(15, 23, 42, 0.6)), url(/bg-building.jpg)'
          : 'linear-gradient(rgba(248, 249, 254, 0.5), rgba(254, 242, 242, 0.6)), url(/bg-building.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
        padding: '16px',
        position: 'relative',
      }}
    >
      {/* --- PREFERENCES TOGGLES --- */}
      <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '8px', alignItems: 'center', background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', padding: '6px', borderRadius: '14px', backdropFilter: 'blur(10px)', zIndex: 10 }}>
        <div style={{ display: 'flex', background: isDarkMode ? 'rgba(244,247,254,0.15)' : 'rgba(0,0,0,0.1)', padding: '2px', borderRadius: '10px', fontSize: '11px' }}>
            <button onClick={() => setLanguage('am')} style={{ padding: '4px 10px', borderRadius: '8px', fontWeight: 'bold', border: 'none', cursor: 'pointer', background: language === 'am' ? '#2563eb' : 'transparent', color: language === 'am' ? '#fff' : (isDarkMode ? '#bfdbfe' : '#475569'), minHeight: '32px' }}>አማ</button>
            <button onClick={() => setLanguage('en')} style={{ padding: '4px 10px', borderRadius: '8px', fontWeight: 'bold', border: 'none', cursor: 'pointer', background: language === 'en' ? '#2563eb' : 'transparent', color: language === 'en' ? '#fff' : (isDarkMode ? '#bfdbfe' : '#475569'), minHeight: '32px' }}>EN</button>
        </div>
        <button onClick={() => setIsDarkMode(!isDarkMode)} style={{ padding: '6px', borderRadius: '10px', background: isDarkMode ? 'rgba(244,247,254,0.1)' : 'rgba(0,0,0,0.1)', border: 'none', color: isDarkMode ? '#fff' : '#000', cursor: 'pointer', minHeight: '32px', minWidth: '32px' }} title="Toggle Day/Night">
            {isDarkMode ? '☀️' : '🌙'}
        </button>
      </div>

      <div
        style={{
          width: '100%',
          maxWidth: '400px',
        }}
      >
        {/* ─── Main Login Card ─── */}
        <div
          style={{
            backgroundColor: isDarkMode ? 'rgba(30, 41, 59, 0.7)' : 'rgba(255, 255, 255, 0.7)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderRadius: '20px',
            boxShadow: isDarkMode ? '0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)' : '0 25px 60px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
            border: isDarkMode ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0,0,0,0.1)',
            overflow: 'hidden',
          }}
        >
          {/* Top brand bar */}
          <div
            style={{
              padding: '24px 28px 20px',
              borderBottom: isDarkMode ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0,0,0,0.1)',
              background: isDarkMode ? 'linear-gradient(135deg, rgba(30, 58, 95, 0.6) 0%, rgba(30, 41, 59, 0.6) 100%)' : 'linear-gradient(135deg, rgba(240, 244, 255, 0.6) 0%, rgba(255, 255, 255, 0.6) 100%)',
            }}
          >
            <p style={{ margin: '0 0 4px', fontSize: '11px', fontWeight: 700, color: '#60a5fa', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Cappadocia Real Estate S.C.
            </p>
            <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: isDarkMode ? '#ffffff' : '#1e293b' }}>
              {language === 'am' ? '🏗️ የዕቃ አስተዳደር' : '🏗️ Store Management System'}
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: isDarkMode ? '#64748b' : '#475569' }}>
              {language === 'am' ? 'ወደ መለያዎ ይግቡ' : 'Sign in to your account'}
            </p>
          </div>

          <div style={{ padding: '24px 28px' }}>
            {error && <div style={errorStyle}>⚠️ {error}</div>}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Username"
                  autoFocus
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    style={{ ...inputStyle, paddingRight: '44px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '16px',
                      color: '#64748b',
                      padding: 0,
                      lineHeight: 1,
                    }}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{ ...btnPrimary, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer', marginTop: '4px' }}
              >
                {loading ? 'Signing in...' : 'Sign In →'}
              </button>
            </form>

            {/* Forgot Password link */}
            <div style={{ textAlign: 'center', marginTop: '16px' }}>
              <button
                type="button"
                onClick={openForgot}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#60a5fa',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0,
                }}
              >
                Forgot Password?
              </button>
            </div>
          </div>
        </div>

        {/* ─── Forgot Password Panel (slides in below) ─── */}
        {forgotStep !== 'closed' && (
          <div
            style={{
              marginTop: '12px',
              backgroundColor: '#1e293b',
              borderRadius: '20px',
              boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
              border: '1px solid #334155',
              overflow: 'hidden',
              animation: 'slideDown 0.25s ease-out',
            }}
          >
            <style>{`@keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }`}</style>

            {/* Panel header */}
            <div
              style={{
                padding: '16px 24px',
                borderBottom: '1px solid #1e3a5f',
                background: 'linear-gradient(135deg, #1e3a5f 0%, #1e293b 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#fff' }}>
                  🔐 Reset Password
                </p>
                <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>
                  {forgotStep === 'username' && 'Step 1 of 2 — Enter your username'}
                  {forgotStep === 'otp' && 'Step 2 of 2 — Check your Telegram'}
                  {forgotStep === 'success' && 'All done!'}
                </p>
              </div>
              <button
                onClick={closeForgot}
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: '28px', height: '28px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '20px 24px' }}>
              {/* Error */}
              {fpError && (
                <div style={{ ...errorStyle, marginBottom: '16px' }}>
                  ⚠️ {fpError}
                </div>
              )}

              {/* STEP 1 — Username */}
              {forgotStep === 'username' && (
                <form onSubmit={handleForgotRequest} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
                    Enter your username. We will send a one-time code to your linked Telegram account.
                  </p>
                  <div>
                    <label style={labelStyle}>Username</label>
                    <input
                      type="text"
                      value={fpUsername}
                      onChange={e => setFpUsername(e.target.value)}
                      placeholder="e.g. SK1"
                      required
                      autoFocus
                      style={inputStyle}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={fpLoading}
                    style={{ ...btnPrimary, opacity: fpLoading ? 0.6 : 1, cursor: fpLoading ? 'not-allowed' : 'pointer' }}
                  >
                    {fpLoading ? 'Sending...' : '📨 Send OTP via Telegram'}
                  </button>
                </form>
              )}

              {/* STEP 2 — OTP + New Password */}
              {forgotStep === 'otp' && (
                <form onSubmit={handleForgotReset} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div
                    style={{
                      padding: '12px 14px',
                      borderRadius: '10px',
                      background: 'rgba(34,197,94,0.08)',
                      border: '1px solid rgba(34,197,94,0.3)',
                    }}
                  >
                    <p style={{ margin: 0, fontSize: '12px', color: '#86efac', fontWeight: 600 }}>
                      ✅ OTP sent! Check your Telegram (@Cappadocia3Bot).
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                      The code expires in 15 minutes.
                    </p>
                  </div>

                  <div>
                    <label style={labelStyle}>OTP Code (6 digits)</label>
                    <input
                      type="text"
                      value={fpOtp}
                      onChange={e => setFpOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="123456"
                      required
                      maxLength={6}
                      autoFocus
                      style={{ ...inputStyle, letterSpacing: '0.3em', textAlign: 'center', fontSize: '18px' }}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>New Password (min 8 characters)</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={fpShowNew ? 'text' : 'password'}
                        value={fpNewPassword}
                        onChange={e => setFpNewPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        minLength={8}
                        style={{ ...inputStyle, paddingRight: '44px' }}
                      />
                      <button type="button" onClick={() => setFpShowNew(v => !v)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#64748b', padding: 0 }}>
                        {fpShowNew ? '🙈' : '👁️'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>Confirm New Password</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={fpShowConfirm ? 'text' : 'password'}
                        value={fpConfirmPassword}
                        onChange={e => setFpConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        style={{
                          ...inputStyle,
                          paddingRight: '44px',
                          borderColor: fpConfirmPassword && fpConfirmPassword !== fpNewPassword ? '#ef4444' : '#334155',
                        }}
                      />
                      <button type="button" onClick={() => setFpShowConfirm(v => !v)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#64748b', padding: 0 }}>
                        {fpShowConfirm ? '🙈' : '👁️'}
                      </button>
                    </div>
                    {fpConfirmPassword && fpConfirmPassword !== fpNewPassword && (
                      <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#f87171', fontWeight: 600 }}>⚠️ Passwords don&apos;t match</p>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => { setForgotStep('username'); setFpError(''); }}
                      style={{ flex: 1, padding: '11px', borderRadius: '10px', border: '1px solid #334155', background: 'transparent', color: '#94a3b8', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      ← Back
                    </button>
                    <button
                      type="submit"
                      disabled={fpLoading}
                      style={{ flex: 2, ...btnPrimary, opacity: fpLoading ? 0.6 : 1, cursor: fpLoading ? 'not-allowed' : 'pointer' }}
                    >
                      {fpLoading ? 'Resetting...' : '🔐 Reset Password'}
                    </button>
                  </div>
                </form>
              )}

              {/* STEP 3 — Success */}
              {forgotStep === 'success' && (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
                  <h3 style={{ margin: '0 0 8px', fontSize: '17px', fontWeight: 800, color: '#fff' }}>
                    Password Reset Successfully!
                  </h3>
                  <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#94a3b8' }}>
                    You can now sign in with your new password.
                  </p>
                  <button
                    onClick={closeForgot}
                    style={{ ...btnPrimary, maxWidth: '200px', margin: '0 auto' }}
                  >
                    Sign In →
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
