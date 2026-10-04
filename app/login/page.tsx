'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/src/components/ui/Button';
import { Lock, Mail, ArrowRight, UserPlus, CheckCircle2, AlertCircle } from 'lucide-react';
import { validatePasswordStrength, isValidEmail } from '@/src/services/auth/auth.schema';
import { useAuth } from '@/src/hooks/useAuth';

export default function LoginPage() {
  const router = useRouter();
  const { login, register } = useAuth();

  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    // ── Client-side pre-validation ─────────────────────────────
    if (!isValidEmail(email)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    if (activeTab === 'register') {
      const pwdCheck = validatePasswordStrength(password);
      if (!pwdCheck.valid) {
        setErrorMsg(pwdCheck.reason || 'Password does not meet strength requirements.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('Passwords do not match.');
        return;
      }
    }

    setLoading(true);

    try {
      // ── IPC call to Electron main process via auth bridge ──────
      const result = activeTab === 'login'
        ? await login(email, password)
        : await register(email, password);

      if (result.success) {
        if (activeTab === 'register') {
          setSuccessMsg('Account created! Redirecting to dashboard…');
        }
        // Brief pause so user sees success state before navigation
        setTimeout(() => router.push('/dashboard'), 400);
      } else {
        // result.error is AppError { code, message, details }
        setErrorMsg(result.error.details ?? result.error.message);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unexpected error — please try again.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at 50% 20%, rgba(99, 102, 241, 0.14) 0%, var(--color-bg-base) 70%)',
        padding: '1.5rem',
      }}
    >
      <div
        style={{
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-xl)',
          padding: '2.5rem',
          width: '100%',
          maxWidth: '440px',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '54px',
              height: '54px',
              background: 'var(--color-accent-muted)',
              border: '1px solid var(--color-accent)',
              borderRadius: 'var(--radius-lg)',
              marginBottom: '0.75rem',
              fontSize: '1.75rem',
            }}
          >
            🗄️
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            SQL Sensi
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: '0.25rem', fontSize: '0.85rem' }}>
            AI-Powered Natural Language Database Assistant
          </p>
        </div>

        {/* Tab Toggle (Sign In vs Register) */}
        <div
          style={{
            display: 'flex',
            backgroundColor: 'var(--color-bg-base)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: '3px',
            marginBottom: '1.25rem',
          }}
        >
          <button
            type="button"
            onClick={() => {
              setActiveTab('login');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            style={{
              flex: 1,
              padding: '0.45rem',
              fontSize: '0.825rem',
              fontWeight: 600,
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: activeTab === 'login' ? 'var(--color-bg-elevated)' : 'transparent',
              color: activeTab === 'login' ? 'var(--color-accent-light)' : 'var(--color-text-secondary)',
              transition: 'all 0.2s ease',
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('register');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            style={{
              flex: 1,
              padding: '0.45rem',
              fontSize: '0.825rem',
              fontWeight: 600,
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: activeTab === 'register' ? 'var(--color-bg-elevated)' : 'transparent',
              color: activeTab === 'register' ? 'var(--color-accent-light)' : 'var(--color-text-secondary)',
              transition: 'all 0.2s ease',
            }}
          >
            Create Account
          </button>
        </div>

        {/* Error / Success Feedback Banners */}
        {errorMsg && (
          <div
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '0.65rem 0.75rem',
              marginBottom: '1rem',
              fontSize: '0.8rem',
              color: '#f87171',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div
            style={{
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '0.65rem 0.75rem',
              marginBottom: '1rem',
              fontSize: '0.8rem',
              color: '#4ade80',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.8rem',
                fontWeight: 500,
                marginBottom: '0.3rem',
                color: 'var(--color-text-secondary)',
              }}
            >
              Email Address
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="email"
                required
                placeholder="analyst@sqlsensi.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem 0.5rem 2.25rem',
                  backgroundColor: 'var(--color-bg-base)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-text-primary)',
                  fontSize: '0.85rem',
                }}
              />
              <Mail size={14} style={{ position: 'absolute', left: '0.75rem', top: '0.75rem', color: 'var(--color-text-secondary)' }} />
            </div>
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.8rem',
                fontWeight: 500,
                marginBottom: '0.3rem',
                color: 'var(--color-text-secondary)',
              }}
            >
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem 0.5rem 2.25rem',
                  backgroundColor: 'var(--color-bg-base)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-text-primary)',
                  fontSize: '0.85rem',
                }}
              />
              <Lock size={14} style={{ position: 'absolute', left: '0.75rem', top: '0.75rem', color: 'var(--color-text-secondary)' }} />
            </div>
            {activeTab === 'register' && (
              <p style={{ fontSize: '0.725rem', color: 'var(--color-text-muted)', marginTop: '0.3rem' }}>
                Must be at least 8 characters with uppercase, lowercase, and numbers.
              </p>
            )}
          </div>

          {activeTab === 'register' && (
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  marginBottom: '0.3rem',
                  color: 'var(--color-text-secondary)',
                }}
              >
                Confirm Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem 0.5rem 2.25rem',
                    backgroundColor: 'var(--color-bg-base)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--color-text-primary)',
                    fontSize: '0.85rem',
                  }}
                />
                <Lock size={14} style={{ position: 'absolute', left: '0.75rem', top: '0.75rem', color: 'var(--color-text-secondary)' }} />
              </div>
            </div>
          )}

          <div style={{ marginTop: '0.5rem' }}>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={loading}
              icon={activeTab === 'login' ? <ArrowRight size={16} /> : <UserPlus size={16} />}
              style={{ width: '100%' }}
            >
              {activeTab === 'login' ? 'Sign In to SQL Sensi' : 'Create Account'}
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}
