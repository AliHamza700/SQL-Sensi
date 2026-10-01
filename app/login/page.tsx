'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/src/components/ui/Button';
import { Lock, Mail, ArrowRight, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('analyst@sqlsensi.local');
  const [password, setPassword] = useState('password123');
  const [loading, setLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      router.push('/dashboard');
    }, 400);
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at 50% 20%, rgba(99, 102, 241, 0.12) 0%, var(--color-bg-base) 70%)',
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
          maxWidth: '420px',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        {/* Brand header */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
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

        {/* Phase notice */}
        <div
          style={{
            backgroundColor: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: '0.75rem',
            marginBottom: '1.25rem',
            fontSize: '0.78rem',
            color: 'var(--color-text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <ShieldCheck size={16} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
          <span>Demo Authentication enabled (Full JWT auth coming in Phase 2).</span>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.825rem',
                fontWeight: 500,
                marginBottom: '0.35rem',
                color: 'var(--color-text-secondary)',
              }}
            >
              Email Address
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="email"
                required
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
                fontSize: '0.825rem',
                fontWeight: 500,
                marginBottom: '0.35rem',
                color: 'var(--color-text-secondary)',
              }}
            >
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                required
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
          </div>

          <div style={{ marginTop: '0.5rem' }}>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={loading}
              icon={<ArrowRight size={16} />}
              style={{ width: '100%' }}
            >
              Sign In to SQL Sensi
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}
