import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Schema Explorer — SQL Sensi',
  description: 'Visually explore your database tables, columns, and relationships.',
};

export default function SchemaPage() {
  return (
    <div style={{ padding: '2rem', color: 'var(--color-text-primary)' }}>
      <h1>Schema Explorer</h1>
      <p className="text-muted" style={{ marginTop: '0.5rem' }}>
        Phase 1 skeleton — schema tree view coming in Phase 5.
      </p>
    </div>
  );
}
