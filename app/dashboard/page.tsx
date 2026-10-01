import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard — SQL Sensi',
  description: 'Overview of your databases and recent conversations.',
};

export default function DashboardPage() {
  return (
    <div style={{ padding: '2rem', color: 'var(--color-text-primary)' }}>
      <h1>Dashboard</h1>
      <p className="text-muted" style={{ marginTop: '0.5rem' }}>
        Phase 1 skeleton — full implementation coming in Phase 3+.
      </p>
    </div>
  );
}
