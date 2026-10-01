'use client';

import React, { useState } from 'react';
import { AppLayout } from '@/src/components/layout/AppLayout';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';
import {
  Save,
  Key,
  Sparkles,
} from 'lucide-react';

export default function SettingsPage() {
  const [provider, setProvider] = useState<'gemini' | 'openai' | 'local'>('gemini');
  const [maxRows, setMaxRows] = useState('10000');
  const [timeout, setTimeoutVal] = useState('30000');

  return (
    <AppLayout title="Settings" databaseName="chinook.db">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '800px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Application Settings & Preferences</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            Configure your swappable AI provider, API keys, query safety ceilings, and local environment variables.
          </p>
        </div>

        {/* AI Provider Config */}
        <Card
          title="AI Provider Selection"
          subtitle="Architecture abstraction: AIProvider interface"
          headerAction={<Badge variant="accent">Swappable</Badge>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
              {(['gemini', 'openai', 'local'] as const).map((p) => {
                const isSelected = provider === p;
                return (
                  <button
                    key={p}
                    onClick={() => setProvider(p)}
                    style={{
                      padding: '1rem 0.75rem',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: isSelected ? 'var(--color-bg-elevated)' : 'var(--color-bg-base)',
                      border: isSelected ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                      cursor: 'pointer',
                      textAlign: 'center',
                      color: isSelected ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                      fontWeight: 600,
                      textTransform: 'capitalize',
                    }}
                  >
                    <Sparkles size={18} style={{ color: isSelected ? 'var(--color-accent)' : 'inherit', margin: '0 auto 0.5rem' }} />
                    {p === 'gemini' ? 'Google Gemini' : p === 'openai' ? 'OpenAI GPT-4o' : 'Local LLM (Ollama)'}
                  </button>
                );
              })}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.35rem' }}>
                {provider === 'gemini' ? 'Gemini API Key' : provider === 'openai' ? 'OpenAI API Key' : 'Local Ollama URL'}
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="password"
                  placeholder={provider === 'local' ? 'http://localhost:11434' : '••••••••••••••••••••••••••••••••'}
                  style={{
                    flex: 1,
                    padding: '0.5rem 0.75rem',
                    backgroundColor: 'var(--color-bg-base)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--color-text-primary)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.85rem',
                  }}
                />
                <Button variant="secondary" icon={<Key size={14} />}>
                  Verify Key
                </Button>
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem', display: 'block' }}>
                API keys are kept strictly in your local configuration and never uploaded.
              </span>
            </div>
          </div>
        </Card>

        {/* Safety Ceilings */}
        <Card title="Query & Safety Ceilings" subtitle="Resource protection per rules.md §29">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.35rem' }}>
                Max Rows Returned
              </label>
              <input
                type="number"
                value={maxRows}
                onChange={(e) => setMaxRows(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  backgroundColor: 'var(--color-bg-base)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-text-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.85rem',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.35rem' }}>
                Execution Timeout (ms)
              </label>
              <input
                type="number"
                value={timeout}
                onChange={(e) => setTimeoutVal(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  backgroundColor: 'var(--color-bg-base)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-text-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.85rem',
                }}
              />
            </div>
          </div>
        </Card>

        <div>
          <Button variant="primary" icon={<Save size={16} />}>
            Save Preferences
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
