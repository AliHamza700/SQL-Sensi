import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Chat — SQL Sensi',
  description: 'Ask natural language questions about your database.',
};

export default function ChatPage() {
  return (
    <div style={{ padding: '2rem', color: 'var(--color-text-primary)' }}>
      <h1>AI Chat Interface</h1>
      <p className="text-muted" style={{ marginTop: '0.5rem' }}>
        Phase 1 skeleton — NL query interface coming in Phase 6–7.
      </p>
    </div>
  );
}
