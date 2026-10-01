import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Login — SQL Sensi',
  description: 'Sign in to SQL Sensi to start analyzing your SQLite databases.',
};

/**
 * Login Page — Phase 2 will implement full authentication.
 * This is the UI skeleton for Day 6.
 */
export default function LoginPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg-base)',
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
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '56px',
              height: '56px',
              background: 'var(--color-accent-muted)',
              borderRadius: 'var(--radius-lg)',
              marginBottom: '1rem',
            }}
          >
            <span style={{ fontSize: '1.75rem' }}>🗄️</span>
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            SQL Sensi
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: '0.25rem', fontSize: '0.875rem' }}>
            AI-Powered Database Assistant
          </p>
        </div>

        {/* Placeholder notice */}
        <div
          style={{
            background: 'var(--color-accent-muted)',
            border: '1px solid var(--color-accent)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
            textAlign: 'center',
            color: 'var(--color-text-secondary)',
            fontSize: '0.875rem',
          }}
        >
          <strong style={{ color: 'var(--color-accent)' }}>Phase 1 — UI Skeleton</strong>
          <br />
          Authentication form will be implemented in Phase 2.
        </div>

        {/* Skeleton Form */}
        <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label
              style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem', color: 'var(--color-text-secondary)' }}
            >
              Email
            </label>
            <div
              style={{
                height: '42px',
                background: 'var(--color-bg-elevated)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                animation: 'pulse 2s ease infinite',
              }}
            />
          </div>
          <div>
            <label
              style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem', color: 'var(--color-text-secondary)' }}
            >
              Password
            </label>
            <div
              style={{
                height: '42px',
                background: 'var(--color-bg-elevated)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                animation: 'pulse 2s ease infinite',
              }}
            />
          </div>
          <div
            style={{
              height: '42px',
              background: 'var(--color-accent)',
              borderRadius: 'var(--radius-md)',
              opacity: 0.4,
              marginTop: '0.5rem',
            }}
          />
        </div>
      </div>
    </main>
  );
}
