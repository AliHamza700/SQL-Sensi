/**
 * Providers — Client-Side Context Boundary (SQL Sensi)
 *
 * Next.js App Router rule: Root layout (app/layout.tsx) is a Server Component.
 * Context providers need 'use client'. This wrapper bridges the boundary.
 *
 * All application-level providers are composed here so layout.tsx stays clean.
 * Add future providers (ThemeProvider, QueryClient, etc.) inside <AuthProvider>.
 */

'use client';

import { AuthProvider, DatabaseProvider } from '@/src/contexts';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DatabaseProvider>
        {children}
      </DatabaseProvider>
    </AuthProvider>
  );
}
