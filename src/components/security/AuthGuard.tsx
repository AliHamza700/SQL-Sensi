'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/src/contexts';

/**
 * AuthGuard — Component wrapper for protected routes.
 * 
 * If the user is authenticated, it renders the children.
 * If the user is not authenticated, it redirects to the /login page.
 * While checking the session state, it displays a loading placeholder.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthContext();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        // Not authenticated -> redirect to login
        router.push('/login');
      } else {
        // Authenticated -> safe to render children
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
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>Verifying session...</p>
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
