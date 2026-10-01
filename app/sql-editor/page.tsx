import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'SQL Editor — SQL Sensi',
  description: 'Review, edit and execute validated SQL queries.',
};

export default function SqlEditorPage() {
  return (
    <div style={{ padding: '2rem', color: 'var(--color-text-primary)' }}>
      <h1>SQL Editor</h1>
      <p className="text-muted" style={{ marginTop: '0.5rem' }}>
        Phase 1 skeleton — SQL review and editing coming in Phase 8.
      </p>
    </div>
  );
}
