'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/src/contexts';

/**
 * GuestGuard — Component wrapper for guest-only routes (e.g. login/register).
 * 
 * If the user is authenticated, it redirects them to the /dashboard.
 * If the user is NOT authenticated, it renders the children (the login form).
 */
export function GuestGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthContext();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        // Already authenticated -> redirect away from login
        router.push('/dashboard');
      } else {
        // Not authenticated -> safe to show login form
        setIsReady(true);
      }
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || !isReady) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-bg-base)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            width: '32px',
            height: '32px',
            border: '3px solid var(--color-border)',
            borderTopColor: 'var(--color-accent)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>Checking session...</p>
        </div>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return <>{children}</>;
}
