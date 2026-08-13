'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

interface ChangePasswordModalProps {
  isOpen: boolean
  onClose: () => void
  language: 'am' | 'en'
  isDarkMode: boolean
  currentUsername?: string
  hasTelegramLinked?: boolean
  currentRecoveryPhone?: string
}

type ModalStep = 'form' | 'success'

export default function ChangePasswordModal({
  isOpen,
  onClose,
  language,
  isDarkMode,
  currentUsername,
  hasTelegramLinked = false,
  currentRecoveryPhone,
}: ChangePasswordModalProps) {
  const [step, setStep] = useState<ModalStep>('form')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)

  // Telegram link/unlink state
  const [telegramLinked, setTelegramLinked] = useState(hasTelegramLinked)
  const [telegramLoading, setTelegramLoading] = useState(false)
  const [telegramMsg, setTelegramMsg] = useState('')


  // Reset when closing
  useEffect(() => {
    if (!isOpen) {
      setStep('form')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setError('')
      setShowCurrentPw(false)
      setShowNewPw(false)
      setShowConfirmPw(false)
      setTelegramMsg('')
    } else {
      // Sync Telegram status from prop each time modal opens
      setTelegramLinked(hasTelegramLinked)
    }
  }, [isOpen, hasTelegramLinked])

  if (!isOpen) return null

  // Unlink Telegram handler
  const handleUnlinkTelegram = async () => {
    if (!confirm(language === 'am' ? 'ቴሌግራምዎን ማስወጣት ይፈልጋሉ?' : 'Unlink your Telegram account?')) return
    setTelegramLoading(true)
    setTelegramMsg('')
    try {
      const res = await fetch('/api/auth/unlink-telegram', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTelegramLinked(false)
      setTelegramMsg(language === 'am' ? '✅ ቴሌግራም ተቋርጧል' : '✅ Telegram unlinked successfully')
    } catch (err: any) {
      setTelegramMsg('❌ ' + (err.message || 'Failed to unlink'))
    } finally {
      setTelegramLoading(false)
    }
  }

  // Password strength indicator
  const getStrength = (pw: string) => {
    if (!pw) return { level: 0, label: '', color: '' }
    let score = 0
    if (pw.length >= 8) score++
    if (pw.length >= 12) score++
    if (/[A-Z]/.test(pw)) score++
    if (/[0-9]/.test(pw)) score++
    if (/[^A-Za-z0-9]/.test(pw)) score++
    if (score <= 1) return { level: score, label: language === 'am' ? 'ደካማ' : 'Weak', color: '#ef4444' }
    if (score <= 3) return { level: score, label: language === 'am' ? 'መካከለኛ' : 'Fair', color: '#f59e0b' }
    return { level: score, label: language === 'am' ? 'ጠንካራ' : 'Strong', color: '#22c55e' }
  }
  const strength = getStrength(newPassword)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (newPassword !== confirmPassword) {
      setError(language === 'am' ? 'አዲስ የይለፍ ቃሎቹ አይዛመዱም!' : 'New passwords do not match!')
      return
    }
    if (newPassword.length < 8) {
      setError(language === 'am' ? 'አዲስ የይለፍ ቃል ቢያንስ 8 ፊደሎች ሊኖሩት ይገባል' : 'New password must be at least 8 characters')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setStep('success')

      // Sign out and redirect after 3 seconds
      setTimeout(async () => {
        const supabase = createClient()
        await supabase.auth.signOut()
        window.location.href = '/login'
      }, 3000)
    } catch (err: any) {
      setError(err.message || (language === 'am' ? 'ስህተት ተከስቷል' : 'An error occurred'))
    } finally {
      setLoading(false)
    }
  }

  const dark = isDarkMode

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(6px)',
        padding: '16px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          background: dark ? '#1e293b' : '#ffffff',
          border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`,
          borderRadius: '20px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px 16px',
            borderBottom: `1px solid ${dark ? '#1e3a5f' : '#e2e8f0'}`,
            background: dark
              ? 'linear-gradient(135deg, #1e3a5f 0%, #1e293b 100%)'
              : 'linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#ffffff' }}>
              🔐 {language === 'am' ? 'የይለፍ ቃል ቀይር' : 'Change Password'}
            </h2>
            {currentUsername && (
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#93c5fd' }}>
                @{currentUsername}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              color: '#fff',
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '24px' }}>
          {step === 'success' ? (
            /* Success State */
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: '56px', marginBottom: '16px' }}>✅</div>
              <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 800, color: dark ? '#fff' : '#1e293b' }}>
                {language === 'am' ? 'የይለፍ ቃሉ ተቀይሯል!' : 'Password Changed!'}
              </h3>
              <p style={{ margin: 0, fontSize: '13px', color: dark ? '#94a3b8' : '#64748b' }}>
                {language === 'am'
                  ? 'ወደ መግቢያ ገጽ እየተዘዋወርን ነው...'
                  : 'Redirecting you to login in 3 seconds...'}
              </p>
              <div
                style={{
                  marginTop: '16px',
                  height: '4px',
                  borderRadius: '2px',
                  background: dark ? '#334155' : '#e2e8f0',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: '100%',
                    background: '#22c55e',
                    animation: 'progress 3s linear forwards',
                  }}
                />
              </div>
              <style>{`@keyframes progress { from { width: 100%; } to { width: 0%; } }`}</style>
            </div>
          ) : (
            /* Form State */
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* ── Telegram Section ── */}
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: '12px',
                  background: telegramLinked
                    ? (dark ? 'rgba(34,197,94,0.08)' : 'rgba(34,197,94,0.06)')
                    : (dark ? 'rgba(245,158,11,0.08)' : 'rgba(245,158,11,0.06)'),
                  border: `1px solid ${telegramLinked ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: telegramLinked ? '#22c55e' : '#f59e0b' }}>
                      {telegramLinked
                        ? (language === 'am' ? '✅ ቴሌግራም ተያይዟል' : '✅ Telegram Linked')
                        : (language === 'am' ? '⚠️ ቴሌግራም አልተያያዘም' : '⚠️ Telegram Not Linked')}
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: '11px', color: dark ? '#64748b' : '#94a3b8', lineHeight: 1.4 }}>
                      {telegramLinked
                        ? (language === 'am'
                            ? 'የይለፍ ቃል ዳግም ማስጀመሪያ ኮድ ወደ ቴሌግራምዎ ይላካል'
                            : 'Password reset codes will be sent to your Telegram')
                        : (language === 'am'
                            ? `@Cappadocia3Bot ላይ /link ${currentUsername || 'USERNAME'} ብለው ያስተሳስሩ`
                            : `Open @Cappadocia3Bot and send: /link ${currentUsername || 'USERNAME'}`)}
                    </p>
                  </div>
                  {telegramLinked && (
                    <button
                      type="button"
                      onClick={handleUnlinkTelegram}
                      disabled={telegramLoading}
                      style={{
                        flexShrink: 0,
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: '1px solid rgba(239,68,68,0.4)',
                        background: 'rgba(239,68,68,0.1)',
                        color: '#f87171',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: telegramLoading ? 'not-allowed' : 'pointer',
                        opacity: telegramLoading ? 0.6 : 1,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {telegramLoading ? '...' : (language === 'am' ? '🔓 አስወጣ' : '🔓 Unlink')}
                    </button>
                  )}
                </div>
                {/* Bot deep link button (shown when not linked) */}
                {!telegramLinked && (
                  <a
                    href={`https://t.me/Cappadocia3Bot?start=link_${currentUsername || ''}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-block',
                      marginTop: '10px',
                      padding: '7px 14px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, #229ED9, #1a7fc1)',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 700,
                      textDecoration: 'none',
                    }}
                  >
                    ✈️ {language === 'am' ? 'ቴሌግራምን ክፈት' : 'Open Telegram Bot'}
                  </a>
                )}
                {telegramMsg && (
                  <p style={{ margin: '8px 0 0', fontSize: '12px', color: telegramMsg.startsWith('✅') ? '#22c55e' : '#f87171', fontWeight: 600 }}>
                    {telegramMsg}
                  </p>
                )}
              </div>

              {/* Error banner */}
              {error && (
                <div
                  style={{
                    background: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.4)',
                    color: '#fca5a5',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 600,
                  }}
                >
                  ⚠️ {error}
                </div>
              )}

              {/* Current Password */}
              <PasswordField
                label={language === 'am' ? 'የአሁን የይለፍ ቃል *' : 'Current Password *'}
                value={currentPassword}
                onChange={setCurrentPassword}
                show={showCurrentPw}
                onToggleShow={() => setShowCurrentPw(v => !v)}
                placeholder="••••••••"
                dark={dark}
                required
              />

              {/* New Password + strength */}
              <div>
                <PasswordField
                  label={language === 'am' ? 'አዲስ የይለፍ ቃል * (ቢያንስ 8 ፊደሎች)' : 'New Password * (min 8 characters)'}
                  value={newPassword}
                  onChange={setNewPassword}
                  show={showNewPw}
                  onToggleShow={() => setShowNewPw(v => !v)}
                  placeholder="••••••••"
                  dark={dark}
                  required
                  minLength={8}
                />
                {/* Strength indicator */}
                {newPassword && (
                  <div style={{ marginTop: '8px' }}>
                    <div
                      style={{
                        height: '4px',
                        borderRadius: '2px',
                        background: dark ? '#334155' : '#e2e8f0',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${(strength.level / 5) * 100}%`,
                          background: strength.color,
                          borderRadius: '2px',
                          transition: 'width 0.3s, background 0.3s',
                        }}
                      />
                    </div>
                    <span style={{ fontSize: '11px', color: strength.color, fontWeight: 700, marginTop: '4px', display: 'block' }}>
                      {strength.label}
                    </span>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <PasswordField
                label={language === 'am' ? 'አዲስ የይለፍ ቃል አረጋግጥ *' : 'Confirm New Password *'}
                value={confirmPassword}
                onChange={setConfirmPassword}
                show={showConfirmPw}
                onToggleShow={() => setShowConfirmPw(v => !v)}
                placeholder="••••••••"
                dark={dark}
                required
                matchValue={newPassword}
              />


              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: '13px',
                  borderRadius: '12px',
                  border: 'none',
                  background: loading ? 'rgba(37,99,235,0.5)' : 'linear-gradient(135deg, #1d4ed8, #2563eb)',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 800,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: loading ? 'none' : '0 4px 12px rgba(37,99,235,0.4)',
                  transition: 'all 0.2s',
                  marginTop: '4px',
                }}
              >
                {loading
                  ? (language === 'am' ? 'እየተለወጠ ነው...' : 'Changing password...')
                  : (language === 'am' ? '🔐 የይለፍ ቃሉን ቀይር' : '🔐 Change Password')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Reusable Password Field Sub-Component ───
interface PFProps {
  label: string
  value: string
  onChange: (v: string) => void
  show: boolean
  onToggleShow: () => void
  placeholder: string
  dark: boolean
  required?: boolean
  minLength?: number
  matchValue?: string
}

function PasswordField({ label, value, onChange, show, onToggleShow, placeholder, dark, required, minLength, matchValue }: PFProps) {
  const mismatch = matchValue !== undefined && value.length > 0 && value !== matchValue
  const borderColor = mismatch ? '#ef4444' : dark ? '#334155' : '#cbd5e1'

  return (
    <div>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: dark ? '#94a3b8' : '#475569' }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          minLength={minLength}
          style={{
            width: '100%',
            padding: '10px 44px 10px 14px',
            borderRadius: '10px',
            border: `1px solid ${borderColor}`,
            background: dark ? '#0f172a' : '#f8fafc',
            color: dark ? '#f1f5f9' : '#1e293b',
            fontSize: '14px',
            outline: 'none',
            boxSizing: 'border-box',
            transition: 'border-color 0.2s',
          }}
        />
        <button
          type="button"
          onClick={onToggleShow}
          style={{
            position: 'absolute',
            right: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '16px',
            color: dark ? '#64748b' : '#94a3b8',
            padding: '0',
            lineHeight: 1,
          }}
        >
          {show ? '🙈' : '👁️'}
        </button>
      </div>
      {mismatch && (
        <span style={{ fontSize: '11px', color: '#ef4444', fontWeight: 600, marginTop: '4px', display: 'block' }}>
          ⚠️ Passwords don't match
        </span>
      )}
    </div>
  )
}
