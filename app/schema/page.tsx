'use client';

import React, { useState } from 'react';
import { AppLayout } from '@/src/components/layout/AppLayout';
import { Card } from '@/src/components/ui/Card';
import { Badge } from '@/src/components/ui/Badge';
import {
  Table,
  Key,
  Link as LinkIcon,
  Search,
} from 'lucide-react';

interface MockTable {
  name: string;
  rowCount: number;
  columns: { name: string; type: string; isPK?: boolean; isFK?: boolean; ref?: string }[];
}

const sampleTables: MockTable[] = [
  {
    name: 'customers',
    rowCount: 59,
    columns: [
      { name: 'CustomerId', type: 'INTEGER', isPK: true },
      { name: 'FirstName', type: 'NVARCHAR(40)' },
      { name: 'LastName', type: 'NVARCHAR(20)' },
      { name: 'Company', type: 'NVARCHAR(80)' },
      { name: 'Email', type: 'NVARCHAR(60)' },
      { name: 'Country', type: 'NVARCHAR(40)' },
      { name: 'SupportRepId', type: 'INTEGER', isFK: true, ref: 'employees.EmployeeId' },
    ],
  },
  {
    name: 'invoices',
    rowCount: 412,
    columns: [
      { name: 'InvoiceId', type: 'INTEGER', isPK: true },
      { name: 'CustomerId', type: 'INTEGER', isFK: true, ref: 'customers.CustomerId' },
      { name: 'InvoiceDate', type: 'DATETIME' },
      { name: 'BillingTotal', type: 'NUMERIC(10,2)' },
      { name: 'BillingCountry', type: 'NVARCHAR(40)' },
    ],
  },
  {
    name: 'tracks',
    rowCount: 3503,
    columns: [
      { name: 'TrackId', type: 'INTEGER', isPK: true },
      { name: 'Name', type: 'NVARCHAR(200)' },
      { name: 'AlbumId', type: 'INTEGER', isFK: true, ref: 'albums.AlbumId' },
      { name: 'GenreId', type: 'INTEGER', isFK: true, ref: 'genres.GenreId' },
      { name: 'Milliseconds', type: 'INTEGER' },
      { name: 'UnitPrice', type: 'NUMERIC(10,2)' },
    ],
  },
];

export default function SchemaPage() {
  const [selectedTable, setSelectedTable] = useState<MockTable>(sampleTables[0]);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredTables = sampleTables.filter((t) =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <AppLayout title="Schema Explorer" databaseName="chinook.db">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Database Schema Explorer</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            Visually inspect all extracted tables, columns, constraints, foreign keys, and indexes.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.25rem', alignItems: 'start' }}>
          {/* Tables List Sidebar */}
          <Card title="Tables" subtitle={`${sampleTables.length} tables in database`}>
            <div style={{ marginBottom: '0.75rem', position: 'relative' }}>
              <input
                type="text"
                placeholder="Filter tables…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.4rem 0.6rem 0.4rem 2rem',
                  backgroundColor: 'var(--color-bg-elevated)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-text-primary)',
                  fontSize: '0.8rem',
                }}
              />
              <Search size={14} style={{ position: 'absolute', left: '0.6rem', top: '0.6rem', color: 'var(--color-text-secondary)' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {filteredTables.map((table) => {
                const isSelected = selectedTable.name === table.name;
                return (
                  <button
                    key={table.name}
                    onClick={() => setSelectedTable(table)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.5rem 0.625rem',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: isSelected ? 'var(--color-bg-elevated)' : 'transparent',
                      border: isSelected ? '1px solid var(--color-accent)' : '1px solid transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: isSelected ? 'var(--color-accent)' : 'var(--color-text-primary)',
                      fontSize: '0.85rem',
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-mono)' }}>
                      <Table size={14} />
                      {table.name}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                      {table.rowCount} rows
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Table Details & Columns View */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <Card
              title={`Table: ${selectedTable.name}`}
              subtitle={`${selectedTable.columns.length} Columns · ~${selectedTable.rowCount} Records`}
              headerAction={
                <Badge variant="accent">{selectedTable.rowCount} Rows</Badge>
              }
            >
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left', color: 'var(--color-text-secondary)' }}>
                      <th style={{ padding: '0.5rem' }}>Column</th>
                      <th style={{ padding: '0.5rem' }}>Type</th>
                      <th style={{ padding: '0.5rem' }}>Key / Constraint</th>
                      <th style={{ padding: '0.5rem' }}>Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTable.columns.map((col) => (
                      <tr key={col.name} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '0.6rem 0.5rem', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                          {col.name}
                        </td>
                        <td style={{ padding: '0.6rem 0.5rem', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
                          {col.type}
                        </td>
                        <td style={{ padding: '0.6rem 0.5rem' }}>
                          {col.isPK && (
                            <Badge variant="warning" size="sm">
                              <Key size={10} style={{ marginRight: '2px' }} /> PK
                            </Badge>
                          )}
                          {col.isFK && (
                            <Badge variant="info" size="sm">
                              <LinkIcon size={10} style={{ marginRight: '2px' }} /> FK
                            </Badge>
                          )}
                        </td>
                        <td style={{ padding: '0.6rem 0.5rem', color: 'var(--color-text-secondary)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                          {col.ref ? `→ ${col.ref}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
