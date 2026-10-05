'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { AppLayout } from '@/src/components/layout/AppLayout';
import { Card } from '@/src/components/ui/Card';
import { Badge } from '@/src/components/ui/Badge';
import { useDatabaseContext } from '@/src/contexts/DatabaseContext';
import { DatabaseSchema, TableSchema, ViewSchema, IndexSchema } from '@/src/types';
import {
  Table as TableIcon,
  Key,
  Link as LinkIcon,
  Search,
  Database,
  Hash,
  FileCode,
  FolderOpen,
  FolderClosed,
  AlertCircle
} from 'lucide-react';

export default function SchemaPage() {
  const { activeDatabasePath, isLoading: isDbLoading } = useDatabaseContext();
  const [schema, setSchema] = useState<DatabaseSchema | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  
  // Selection state (could be table, view, or index)
  const [selectedType, setSelectedType] = useState<'table' | 'view' | 'index' | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  // Tree toggle states
  const [expanded, setExpanded] = useState({
    tables: true,
    views: true,
    indexes: false
  });

  const toggleFolder = (folder: keyof typeof expanded) => {
    setExpanded(prev => ({ ...prev, [folder]: !prev[folder] }));
  };

  useEffect(() => {
    if (isDbLoading) return;
    
    if (!activeDatabasePath) {
      setSchema(null);
      return;
    }

    const loadSchema = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await window.electronAPI!.schema.extract();
        if (res.success) {
          setSchema(res.data);
          // Auto-select first table if available
          if (res.data.tables.length > 0) {
            setSelectedType('table');
            setSelectedName(res.data.tables[0].name);
          }
        } else {
          setError(res.error.message);
        }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        setError(err.message || 'Failed to load schema');
      } finally {
        setIsLoading(false);
      }
    };

    loadSchema();
  }, [activeDatabasePath, isDbLoading]);

  // Derived filtered data
  const filteredTables = useMemo(() => {
    if (!schema) return [];
    return schema.tables.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [schema, searchTerm]);

  const filteredViews = useMemo(() => {
    if (!schema) return [];
    return schema.views.filter(v => v.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [schema, searchTerm]);

  const filteredIndexes = useMemo(() => {
    if (!schema) return [];
    return schema.indexes.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [schema, searchTerm]);

  const handleSelect = (type: 'table'|'view'|'index', name: string) => {
    setSelectedType(type);
    setSelectedName(name);
  };

  if (!activeDatabasePath && !isDbLoading) {
    return (
      <AppLayout title="Schema Explorer">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: '1rem', color: 'var(--color-text-secondary)' }}>
          <Database size={48} opacity={0.5} />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>No Database Connected</h2>
          <p>Go to the Database tab to connect a SQLite file.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Schema Explorer" databaseName={schema?.databaseName}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', height: '100%' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Database Schema Explorer</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            Visually inspect all extracted tables, columns, constraints, foreign keys, and indexes.
          </p>
        </div>

        {error && (
          <div style={{ padding: '1rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-danger)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem', color: 'var(--color-text-secondary)' }}>
            Loading schema...
          </div>
        ) : schema ? (
          <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.25rem', alignItems: 'start', flex: 1, minHeight: 0 }}>
            {/* Sidebar Navigation */}
            <Card title="Database Objects" style={{ display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 180px)' }}>
              <div style={{ marginBottom: '0.75rem', position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Filter objects..."
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

              <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                
                {/* TABLES FOLDER */}
                <div>
                  <button onClick={() => toggleFolder('tables')} style={folderBtnStyle}>
                    {expanded.tables ? <FolderOpen size={14} color="#60A5FA" /> : <FolderClosed size={14} color="#60A5FA" />}
                    <span style={{ fontWeight: 600 }}>Tables ({filteredTables.length})</span>
                  </button>
                  {expanded.tables && (
                    <div style={{ paddingLeft: '1.25rem', marginTop: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                      {filteredTables.map(t => (
                        <NavItem 
                          key={t.name}
                          icon={<TableIcon size={12} />} 
                          label={t.name} 
                          isSelected={selectedType === 'table' && selectedName === t.name}
                          onClick={() => handleSelect('table', t.name)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* VIEWS FOLDER */}
                <div style={{ marginTop: '0.5rem' }}>
                  <button onClick={() => toggleFolder('views')} style={folderBtnStyle}>
                    {expanded.views ? <FolderOpen size={14} color="#A78BFA" /> : <FolderClosed size={14} color="#A78BFA" />}
                    <span style={{ fontWeight: 600 }}>Views ({filteredViews.length})</span>
                  </button>
                  {expanded.views && (
                    <div style={{ paddingLeft: '1.25rem', marginTop: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                      {filteredViews.map(v => (
                        <NavItem 
                          key={v.name}
                          icon={<FileCode size={12} />} 
                          label={v.name} 
                          isSelected={selectedType === 'view' && selectedName === v.name}
                          onClick={() => handleSelect('view', v.name)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* INDEXES FOLDER */}
                <div style={{ marginTop: '0.5rem' }}>
                  <button onClick={() => toggleFolder('indexes')} style={folderBtnStyle}>
                    {expanded.indexes ? <FolderOpen size={14} color="#34D399" /> : <FolderClosed size={14} color="#34D399" />}
                    <span style={{ fontWeight: 600 }}>Indexes ({filteredIndexes.length})</span>
                  </button>
                  {expanded.indexes && (
                    <div style={{ paddingLeft: '1.25rem', marginTop: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                      {filteredIndexes.map(i => (
                        <NavItem 
                          key={i.name}
                          icon={<Hash size={12} />} 
                          label={i.name} 
                          isSelected={selectedType === 'index' && selectedName === i.name}
                          onClick={() => handleSelect('index', i.name)}
                        />
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </Card>

            {/* Detail View */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', maxHeight: 'calc(100vh - 180px)' }}>
              
              {selectedType === 'table' && (
                <TableDetailView 
                  table={schema.tables.find(t => t.name === selectedName)!} 
                  schema={schema}
                />
              )}

              {selectedType === 'view' && (
                <ViewDetailView 
                  view={schema.views.find(v => v.name === selectedName)!}
                />
              )}

              {selectedType === 'index' && (
                <IndexDetailView 
                  index={schema.indexes.find(i => i.name === selectedName)!}
                />
              )}
              
            </div>
          </div>
        ) : null}
      </div>
    </AppLayout>
  );
}

// ─── Sub-components ──────────────────────────────────────────

const folderBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  background: 'none',
  border: 'none',
  color: 'var(--color-text-primary)',
  fontSize: '0.8rem',
  cursor: 'pointer',
  padding: '0.25rem 0',
  width: '100%',
  textAlign: 'left'
};

function NavItem({ icon, label, isSelected, onClick }: { icon: React.ReactNode; label: string; isSelected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.35rem 0.5rem',
        borderRadius: 'var(--radius-sm)',
        backgroundColor: isSelected ? 'var(--color-bg-elevated)' : 'transparent',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        color: isSelected ? 'var(--color-accent)' : 'var(--color-text-secondary)',
        fontSize: '0.8rem',
        transition: 'background 0.15s ease',
        fontFamily: 'var(--font-mono)'
      }}
    >
      {icon}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  );
}

function TableDetailView({ table, schema }: { table: TableSchema; schema: DatabaseSchema }) {
  if (!table) return null;

  // Find incoming relationships
  const incoming = schema.relationships.filter(r => r.toTable === table.name);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <Card
        title={`Table: ${table.name}`}
        subtitle={`${table.columns.length} Columns`}
        headerAction={
          <Badge variant="accent">{table.rowCount} Rows</Badge>
        }
      >
        <div style={{ overflowX: 'auto', background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left', color: 'var(--color-text-secondary)' }}>
                <th style={{ padding: '0.75rem', fontWeight: 600 }}>Column</th>
                <th style={{ padding: '0.75rem', fontWeight: 600 }}>Type</th>
                <th style={{ padding: '0.75rem', fontWeight: 600 }}>Attributes</th>
                <th style={{ padding: '0.75rem', fontWeight: 600 }}>Reference</th>
              </tr>
            </thead>
            <tbody>
              {table.columns.map((col) => {
                const fk = table.foreignKeys.find(f => f.columnName === col.name);
                return (
                  <tr key={col.name} style={{ borderBottom: '1px solid var(--color-border)', transition: 'background 0.2s' }}>
                    <td style={{ padding: '0.75rem', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
                      {col.name}
                    </td>
                    <td style={{ padding: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                      <span style={{ color: '#F472B6' }}>{col.type || 'UNKNOWN'}</span>
                    </td>
                    <td style={{ padding: '0.75rem', display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      {col.isPrimaryKey && (
                        <Badge variant="warning" size="sm" style={{ background: 'rgba(251, 191, 36, 0.15)', color: '#FCD34D' }}>
                          <Key size={10} style={{ marginRight: '4px' }} /> PK
                        </Badge>
                      )}
                      {fk && (
                        <Badge variant="info" size="sm" style={{ background: 'rgba(96, 165, 250, 0.15)', color: '#93C5FD' }}>
                          <LinkIcon size={10} style={{ marginRight: '4px' }} /> FK
                        </Badge>
                      )}
                      {!col.nullable && !col.isPrimaryKey && (
                        <Badge variant="outline" size="sm" style={{ borderColor: 'var(--color-border)' }}>NOT NULL</Badge>
                      )}
                      {col.defaultValue !== null && (
                        <Badge variant="outline" size="sm" style={{ borderColor: 'var(--color-border)', fontStyle: 'italic' }}>
                          DEF: {col.defaultValue}
                        </Badge>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem', color: 'var(--color-text-secondary)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                      {fk ? <span style={{ color: '#93C5FD' }}>→ {fk.referencedTable}.{fk.referencedColumn}</span> : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {incoming.length > 0 && (
        <Card title="Incoming References" subtitle="Tables that reference this table">
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {incoming.map((r, i) => (
              <li key={i} style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)', padding: '0.5rem', backgroundColor: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ color: '#A78BFA' }}>{r.fromTable}.{r.fromColumn}</span> → {r.toTable}.{r.toColumn}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function ViewDetailView({ view }: { view: ViewSchema }) {
  if (!view) return null;
  return (
    <Card title={`View: ${view.name}`}>
      <div style={{ backgroundColor: 'var(--color-bg-elevated)', padding: '1rem', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#93C5FD', whiteSpace: 'pre-wrap', border: '1px solid var(--color-border)' }}>
        {view.sql || '-- No SQL available'}
      </div>
    </Card>
  );
}

function IndexDetailView({ index }: { index: IndexSchema }) {
  if (!index) return null;
  return (
    <Card title={`Index: ${index.name}`} subtitle={`Table: ${index.tableName}`}>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <Badge variant={index.unique ? 'warning' : 'outline'}>
          {index.unique ? 'UNIQUE' : 'NON-UNIQUE'}
        </Badge>
      </div>
      <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.85rem' }}>Indexed Columns:</div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {index.columns.map((col, i) => (
          <li key={i} style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)', padding: '0.5rem', backgroundColor: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-sm)', display: 'inline-block' }}>
            {col}
          </li>
        ))}
      </ul>
    </Card>
  );
}
