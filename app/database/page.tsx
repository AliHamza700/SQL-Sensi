'use client';

import React from 'react';
import { AppLayout } from '@/src/components/layout/AppLayout';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';
import { useDatabaseContext } from '@/src/contexts';
import { useFileDialog, isElectron } from '@/src/hooks/useElectron';
import { DatabaseValidationResult } from '@/src/types';
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

  const { activeDatabasePath, setActiveDatabasePath } = useDatabaseContext();
  const [validationResult, setValidationResult] = React.useState<DatabaseValidationResult | null>(null);
  const [isValidating, setIsValidating] = React.useState(false);

  React.useEffect(() => {
    async function validate() {
      if (!activeDatabasePath || !isElectron() || !window.electronAPI) {
        setValidationResult(null);
        return;
      }
      setIsValidating(true);
      try {
        const res = await window.electronAPI.database.validateFile(activeDatabasePath);
        if (res.success) {
          setValidationResult(res.data);
        } else {
          setValidationResult({ valid: false, error: res.error.message });
        }
      } catch (err: unknown) {
        setValidationResult({ valid: false, error: err instanceof Error ? err.message : 'Unknown error' });
      } finally {
        setIsValidating(false);
      }
    }
    validate();
  }, [activeDatabasePath]);

  const handleOpenDialog = async () => {
    const path = await openDialog();
    if (path) {
      setActiveDatabasePath(path);
    }
  };

  // For display purposes, extract the filename from the absolute path
  const activeDbFilename = activeDatabasePath 
    ? activeDatabasePath.split(/[/\\]/).pop() 
    : 'No database selected';

  return (
    <AppLayout title="Database Manager" databaseName={activeDbFilename}>
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
                onClick={handleOpenDialog}
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
              <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{activeDbFilename}</span>
            </div>
            <div style={{ padding: '0.75rem', backgroundColor: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', display: 'block' }}>Full Path</span>
              <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '0.8rem', wordBreak: 'break-all' }}>
                {activeDatabasePath || 'None'}
              </span>
            </div>
            <div style={{ padding: '0.75rem', backgroundColor: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', display: 'block' }}>File Size</span>
              <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                {isValidating ? 'Checking...' : validationResult?.fileSizeInBytes ? `${(validationResult.fileSizeInBytes / 1024).toFixed(2)} KB` : '-'}
              </span>
            </div>
            <div style={{ padding: '0.75rem', backgroundColor: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', display: 'block' }}>Tables Detected</span>
              <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{activeDatabasePath ? (validationResult?.valid ? 'Pending scan' : '-') : '-'}</span>
            </div>
            <div style={{ padding: '0.75rem', backgroundColor: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', display: 'block' }}>Header Check</span>
              <span style={{ 
                color: activeDatabasePath 
                  ? (isValidating ? 'var(--color-warning)' : (validationResult?.valid ? 'var(--color-success)' : 'var(--color-danger)')) 
                  : 'var(--color-text-secondary)', 
                fontWeight: 600, 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.25rem' 
              }}>
                {activeDatabasePath ? (
                  isValidating ? <>Checking...</> : 
                  validationResult?.valid ? <><CheckCircle2 size={14} /> SQLite 3.x Valid</> : 
                  <span title={validationResult?.error}>Invalid Format</span>
                ) : (
                  <>Waiting for file</>
                )}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
