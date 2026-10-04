import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'SQL Sensi — AI-Powered Database Assistant',
  description:
    'Upload a SQLite database, ask questions in plain English, and get instant SQL, results, and visualizations.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/*
         * Providers wraps the entire React tree with application-level
         * context providers (AuthProvider, and future providers).
         * It lives in app/providers.tsx as a 'use client' boundary.
         */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
