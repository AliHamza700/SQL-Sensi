'use client';

import React, { useState } from 'react';
import { AppLayout } from '@/src/components/layout/AppLayout';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import {
  Table as TableIcon,
  BarChart2,
  PieChart,
  Download,
  Clock,
  Rows,
  FileSpreadsheet,
} from 'lucide-react';

interface MockRow {
  CustomerId: number;
  CustomerName: string;
  TotalSpent: number;
}

const sampleResults: MockRow[] = [
  { CustomerId: 6, CustomerName: 'Helena Holý', TotalSpent: 49.62 },
  { CustomerId: 26, CustomerName: 'Richard Cunha', TotalSpent: 47.62 },
  { CustomerId: 57, CustomerName: 'Luis Rojas', TotalSpent: 46.62 },
  { CustomerId: 45, CustomerName: 'Ladislav Kovács', TotalSpent: 45.62 },
  { CustomerId: 46, CustomerName: 'Hugh O\'Reilly', TotalSpent: 45.62 },
];

export default function ResultsPage() {
  const [chartType, setChartType] = useState<'table' | 'bar' | 'pie'>('table');

  return (
    <AppLayout title="Query Results & Visualization" databaseName="chinook.db">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '1100px' }}>
        {/* Results Header with Metadata */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Results & Visualizations</h1>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem', fontSize: '0.825rem', color: 'var(--color-text-secondary)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Clock size={14} /> 4.2 ms execution time
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Rows size={14} /> 5 rows returned
              </span>
            </div>
          </div>

          {/* Export Dropdown / Actions */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button variant="outline" size="sm" icon={<Download size={14} />}>
              CSV
            </Button>
            <Button variant="outline" size="sm" icon={<FileSpreadsheet size={14} />}>
              Excel
            </Button>
            <Button variant="outline" size="sm" icon={<Download size={14} />}>
              PDF
            </Button>
          </div>
        </div>

        {/* View Switcher & Results Card */}
        <Card
          title="Data View"
          headerAction={
            <div style={{ display: 'flex', gap: '0.25rem', backgroundColor: 'var(--color-bg-base)', padding: '0.2rem', borderRadius: 'var(--radius-md)' }}>
              <Button
                variant={chartType === 'table' ? 'primary' : 'ghost'}
                size="sm"
                icon={<TableIcon size={14} />}
                onClick={() => setChartType('table')}
              >
                Table
              </Button>
              <Button
                variant={chartType === 'bar' ? 'primary' : 'ghost'}
                size="sm"
                icon={<BarChart2 size={14} />}
                onClick={() => setChartType('bar')}
              >
                Bar Chart
              </Button>
              <Button
                variant={chartType === 'pie' ? 'primary' : 'ghost'}
                size="sm"
                icon={<PieChart size={14} />}
                onClick={() => setChartType('pie')}
              >
                Pie Chart
              </Button>
            </div>
          }
        >
          {chartType === 'table' ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left', color: 'var(--color-text-secondary)' }}>
                    <th style={{ padding: '0.6rem 0.5rem' }}>CustomerId</th>
                    <th style={{ padding: '0.6rem 0.5rem' }}>CustomerName</th>
                    <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>TotalSpent ($)</th>
                  </tr>
                </thead>
                <tbody>
                  {sampleResults.map((row) => (
                    <tr key={row.CustomerId} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '0.6rem 0.5rem', fontFamily: 'var(--font-mono)' }}>
                        {row.CustomerId}
                      </td>
                      <td style={{ padding: '0.6rem 0.5rem', fontWeight: 500 }}>
                        {row.CustomerName}
                      </td>
                      <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--color-accent)' }}>
                        ${row.TotalSpent.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div
              style={{
                height: '300px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'var(--color-bg-base)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-text-secondary)',
                gap: '0.5rem',
              }}
            >
              <BarChart2 size={40} style={{ color: 'var(--color-accent)' }} />
              <p style={{ fontSize: '0.9rem' }}>
                Interactive Chart.js visualizer ({chartType.toUpperCase()} mode).
              </p>
              <span style={{ fontSize: '0.75rem' }}>
                Renders numeric columns (<code style={{ color: 'var(--color-accent)' }}>TotalSpent</code>) by category (<code style={{ color: 'var(--color-accent)' }}>CustomerName</code>).
              </span>
            </div>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}
