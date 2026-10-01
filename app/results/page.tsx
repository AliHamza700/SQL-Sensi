import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Results — SQL Sensi',
  description: 'View query results and interactive charts.',
};

export default function ResultsPage() {
  return (
    <div style={{ padding: '2rem', color: 'var(--color-text-primary)' }}>
      <h1>Results & Visualization</h1>
      <p className="text-muted" style={{ marginTop: '0.5rem' }}>
        Phase 1 skeleton — results table and charts coming in Phase 11.
      </p>
    </div>
  );
}
