'use client';

import React from 'react';
import { AppLayout } from '@/src/components/layout/AppLayout';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';
import { useFileDialog } from '@/src/hooks/useElectron';
import {
  UploadCloud,
  FileCheck,
  CheckCircle2,
  FolderOpen,
} from 'lucide-react';

export default function DatabasePage() {
  const { openDialog, selectedPath, available } = useFileDialog({
    filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3'] }],
  });

  const activeDb = 'chinook.db';

  return (
    <AppLayout title="Database Manager" databaseName={activeDb}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1000px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Database Connection & Manager</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            Upload or select local SQLite databases. The application opens databases in strictly read-only mode.
          </p>
        </div>

        {/* Upload / File Picker Card */}
        <Card title="Open SQLite Database">
          <div
            style={{
              border: '2px dashed var(--color-border-strong)',
              borderRadius: 'var(--radius-lg)',
              padding: '2.5rem 1.5rem',
              textAlign: 'center',
              backgroundColor: 'var(--color-bg-elevated)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1rem',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-accent-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-accent)',
              }}
            >
              <UploadCloud size={28} />
            </div>

            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Choose a SQLite database file</h3>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.825rem', marginTop: '0.25rem' }}>
                Supports standard <code style={{ color: 'var(--color-accent)' }}>.db</code>, <code style={{ color: 'var(--color-accent)' }}>.sqlite</code>, and <code style={{ color: 'var(--color-accent)' }}>.sqlite3</code> formats.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <Button
                variant="primary"
                icon={<FolderOpen size={16} />}
                onClick={() => openDialog()}
              >
                Browse Files {available ? '(Native Dialog)' : ''}
              </Button>
            </div>

            {selectedPath && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 1rem',
                  backgroundColor: 'var(--color-bg-surface)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  fontSize: '0.85rem',
                }}
              >
                <FileCheck size={16} style={{ color: 'var(--color-success)' }} />
                <span>Selected: <strong style={{ fontFamily: 'var(--font-mono)' }}>{selectedPath}</strong></span>
              </div>
            )}
          </div>
        </Card>

        {/* Current Active Database Info */}
        <Card
          title="Active Database Details"
          headerAction={<Badge variant="success">Connected (Read-Only)</Badge>}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div style={{ padding: '0.75rem', backgroundColor: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', display: 'block' }}>File Name</span>
              <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{activeDb}</span>
            </div>
            <div style={{ padding: '0.75rem', backgroundColor: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', display: 'block' }}>File Size</span>
              <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>864 KB</span>
            </div>
            <div style={{ padding: '0.75rem', backgroundColor: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', display: 'block' }}>Tables Detected</span>
              <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>11 Tables</span>
            </div>
            <div style={{ padding: '0.75rem', backgroundColor: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', display: 'block' }}>Header Check</span>
              <span style={{ color: 'var(--color-success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <CheckCircle2 size={14} /> SQLite 3.x Valid
              </span>
            </div>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
