import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Settings — SQL Sensi',
  description: 'Configure AI provider, preferences, and application settings.',
};

export default function SettingsPage() {
  return (
    <div style={{ padding: '2rem', color: 'var(--color-text-primary)' }}>
      <h1>Settings</h1>
      <p className="text-muted" style={{ marginTop: '0.5rem' }}>
        Phase 1 skeleton — AI provider config and preferences coming soon.
      </p>
    </div>
  );
}
