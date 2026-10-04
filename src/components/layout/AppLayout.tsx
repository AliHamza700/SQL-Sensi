'use client';

import React from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { AuthGuard } from '@/src/components/security/AuthGuard';

export interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  databaseName?: string | null;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  title,
  databaseName,
}) => {
  return (
    <AuthGuard>
      <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--color-bg-base)' }}>
        {/* Fixed Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div
        style={{
          marginLeft: 'var(--sidebar-width)',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        <Header title={title} databaseName={databaseName} />
        <main style={{ flex: 1, padding: '1.5rem', overflowY: 'auto' }}>
          {children}
        </main>
      </div>
      </div>
    </AuthGuard>
  );
};
