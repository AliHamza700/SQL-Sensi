'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AppLayout } from '@/src/components/layout/AppLayout';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';
import {
  Play,
  ShieldCheck,
  Zap,
  CheckCircle2,
  Lightbulb,
} from 'lucide-react';

const defaultSQL = `SELECT 
  c.CustomerId,
  c.FirstName || ' ' || c.LastName AS CustomerName,
  ROUND(SUM(i.BillingTotal), 2) AS TotalSpent
FROM customers c
JOIN invoices i ON c.CustomerId = i.CustomerId
GROUP BY c.CustomerId
ORDER BY TotalSpent DESC
LIMIT 5;`;

export default function SqlEditorPage() {
  const [sql, setSql] = useState(defaultSQL);
  const [isValidated, setIsValidated] = useState(true);

  const handleSqlChange = (val: string) => {
    setSql(val);
    // As per rules.md §7: Re-validation is required whenever user edits SQL
    setIsValidated(false);
  };

  return (
    <AppLayout title="SQL Editor & Optimizer" databaseName="chinook.db">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '1100px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>SQL Review & Execution Engine</h1>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
              Review AI-generated queries, edit safely, view query plans, and execute with strict read-only validation.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button
              variant="secondary"
              icon={<Zap size={14} />}
              onClick={() => setIsValidated(true)}
            >
              Validate & Optimize
            </Button>
            <Link href="/results">
              <Button variant="primary" icon={<Play size={14} />}>
                Execute Query
              </Button>
            </Link>
          </div>
        </div>

        {/* Editor Card */}
        <Card
          title="SQL Query Editor"
          headerAction={
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <Badge variant={isValidated ? 'success' : 'warning'} size="sm">
                <ShieldCheck size={12} style={{ marginRight: '3px' }} />
                {isValidated ? 'Read-Only Validated' : 'Edited — Needs Revalidation'}
              </Badge>
            </div>
          }
        >
          <textarea
            value={sql}
            onChange={(e) => handleSqlChange(e.target.value)}
            rows={8}
            style={{
              width: '100%',
              backgroundColor: 'var(--color-bg-base)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '1rem',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.85rem',
              color: 'var(--color-text-primary)',
              lineHeight: 1.6,
              resize: 'vertical',
              outline: 'none',
            }}
          />
        </Card>

        {/* Query Optimization & EXPLAIN Section */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <Card
            title="EXPLAIN QUERY PLAN Breakdown"
            subtitle="Parsed SQLite execution strategy"
            headerAction={<Badge variant="info">SCAN / SEARCH</Badge>}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.825rem' }}>
              <div style={{ padding: '0.5rem 0.75rem', backgroundColor: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)' }}>
                SCAN customers c USING INDEX idx_customers_id
              </div>
              <div style={{ padding: '0.5rem 0.75rem', backgroundColor: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)' }}>
                SEARCH invoices i USING INDEX idx_invoices_customer_id (CustomerId=?)
              </div>
              <div style={{ padding: '0.5rem 0.75rem', backgroundColor: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)' }}>
                USE TEMP B-TREE FOR ORDER BY
              </div>
            </div>
          </Card>

          <Card
            title="Optimization Suggestions"
            subtitle="Deterministic & AI-assisted recommendations"
            headerAction={<Lightbulb size={18} style={{ color: 'var(--color-warning)' }} />}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.825rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                <CheckCircle2 size={16} style={{ color: 'var(--color-success)', flexShrink: 0, marginTop: '2px' }} />
                <span>No <code style={{ color: 'var(--color-warning)' }}>SELECT *</code> found. Explicit projection used.</span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                <CheckCircle2 size={16} style={{ color: 'var(--color-success)', flexShrink: 0, marginTop: '2px' }} />
                <span>LIMIT 5 prevents large unpaged memory consumption.</span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                <Lightbulb size={16} style={{ color: 'var(--color-info)', flexShrink: 0, marginTop: '2px' }} />
                <span>Informational: Adding composite index on <code style={{ color: 'var(--color-accent)' }}>invoices(CustomerId, BillingTotal)</code> could avoid table lookups.</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
