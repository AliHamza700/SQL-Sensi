import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Database — SQL Sensi',
  description: 'Upload and manage your SQLite database files.',
};

export default function DatabasePage() {
  return (
    <div style={{ padding: '2rem', color: 'var(--color-text-primary)' }}>
      <h1>Database Upload</h1>
      <p className="text-muted" style={{ marginTop: '0.5rem' }}>
        Phase 1 skeleton — SQLite upload and validation coming in Phase 3.
      </p>
    </div>
  );
}
