'use client';

import { useElectronInfo } from '@/src/hooks/useElectron';

/**
 * Dashboard Page — SQL Sensi
 *
 * Day 4: Demonstrates working Electron ↔ Next.js IPC.
 * The version and platform are fetched from the Electron main process
 * via ipcRenderer.invoke() → ipcMain.handle().
 */
export default function DashboardPage() {
  const { isElectron, version, platform, loading, error } = useElectronInfo();

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--color-bg-base)',
        padding: '2rem',
        color: 'var(--color-text-primary)',
      }}
    >
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>
        🗄️ SQL Sensi Dashboard
      </h1>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: '2rem' }}>
        AI-Powered Natural Language Database Assistant
      </p>

      {/* ── IPC Status Card ─────────────────────────────── */}
      <div
        style={{
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.5rem',
          maxWidth: '480px',
          marginBottom: '1.5rem',
        }}
      >
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
          ⚡ Electron IPC Status
        </h2>

        {loading ? (
          <p style={{ color: 'var(--color-text-secondary)' }}>Connecting to main process…</p>
        ) : error ? (
          <p style={{ color: 'var(--color-danger)' }}>IPC Error: {error}</p>
        ) : (
          <dl style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Row label="Running in Electron" value={isElectron ? '✅ Yes' : '🌐 Browser (no IPC)'} />
            <Row label="App Version" value={version ?? 'N/A (browser mode)'} />
            <Row label="Platform" value={platform ?? 'N/A (browser mode)'} />
            <Row label="IPC Channel" value="app:get-version / app:get-platform" />
          </dl>
        )}
      </div>

      {/* ── Phase tracker ───────────────────────────────── */}
      <div
        style={{
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.5rem',
          maxWidth: '480px',
        }}
      >
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
          📋 Phase 1 Progress
        </h2>
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.375rem', fontSize: '0.875rem' }}>
          <PhaseItem done label="Day 1 — Project Setup" />
          <PhaseItem done label="Day 2 — Architecture Layers & Interfaces" />
          <PhaseItem done label="Day 3 — Git Workflow & Branches" />
          <PhaseItem done label="Day 4 — Electron + Next.js + IPC" />
          <PhaseItem label="Day 5 — Folder Structure (next)" />
          <PhaseItem label="Day 6 — UI Skeleton" />
          <PhaseItem label="Day 7 — Review" />
        </ul>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '0.875rem' }}>
      <dt style={{ color: 'var(--color-text-secondary)' }}>{label}</dt>
      <dd style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-accent)' }}>{value}</dd>
    </div>
  );
}

function PhaseItem({ label, done }: { label: string; done?: boolean }) {
  return (
    <li style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
      <span>{done ? '✅' : '⏳'}</span>
      <span style={{ color: done ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
        {label}
      </span>
    </li>
  );
}
