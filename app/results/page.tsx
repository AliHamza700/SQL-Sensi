'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppLayout } from '@/src/components/layout/AppLayout';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import {
  Table as TableIcon,
  BarChart2,
  PieChart,
  LineChart,
  ScatterChart,
  Download,
  Clock,
  Rows,
  FileSpreadsheet,
  AlertTriangle,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { inferColumnTypes, autoSelectChartType, ChartType } from '@/src/utils/visualization';
import { ChartRenderer } from '@/src/components/visualization/ChartRenderer';

function ResultsContent() {
  const searchParams = useSearchParams();
  const sql = searchParams.get('sql');
  
  const [chartType, setChartType] = useState<ChartType>('table');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  useEffect(() => {
    async function execute() {
      if (!sql) {
        setErrorMsg('No SQL query provided.');
        setLoading(false);
        return;
      }
      const electron = window.electronAPI;
      if (!electron) return;

      try {
        const res = await electron.database.executeQuery(sql);
        if (res.success) {
          setData(res.data);
          
          // Auto-select chart type
          const meta = inferColumnTypes(res.data.columns, res.data.rows);
          const autoChart = autoSelectChartType(meta, res.data.rowCount);
          setChartType(autoChart);
        } else {
          setErrorMsg(res.error?.message || 'Failed to execute query.');
        }
      } catch (err: any) {
        setErrorMsg(err.message || 'An unexpected error occurred.');
      } finally {
        setLoading(false);
      }
    }
    execute();
  }, [sql]);

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Executing query...</div>;
  }

  if (errorMsg) {
    return (
      <div style={{ padding: '2rem' }}>
        <div style={{ padding: '1rem', backgroundColor: 'var(--color-bg-elevated)', borderLeft: '4px solid #ef4444', borderRadius: 'var(--radius-md)' }}>
          <strong style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={16} /> Execution Error
          </strong> 
          <p style={{ marginTop: '0.5rem' }}>{errorMsg}</p>
          <pre style={{ marginTop: '1rem', padding: '0.5rem', background: '#000', color: '#fff', fontSize: '0.8rem' }}>{sql}</pre>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // Pagination logic
  const totalPages = Math.ceil(data.rowCount / pageSize);
  const paginatedRows = data.rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Export handlers
  const handleExportCSV = async () => {
    if (!data) return;
    const { convertToCSV } = await import('@/src/utils/export');
    const csvStr = convertToCSV(data);
    const res = await window.electronAPI!.export.saveData(csvStr, 'export.csv', 'csv');
    if (res.success) {
      console.log('Saved CSV to', res.data);
    }
  };

  const handleExportJSON = async () => {
    if (!data) return;
    const jsonStr = JSON.stringify(data, null, 2);
    const res = await window.electronAPI!.export.saveData(jsonStr, 'export.json', 'json');
    if (res.success) {
      console.log('Saved JSON to', res.data);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '1100px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Results & Visualizations</h1>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem', fontSize: '0.825rem', color: 'var(--color-text-secondary)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Clock size={14} /> {data.executionTimeMs.toFixed(2)} ms execution time
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Rows size={14} /> {data.rowCount} rows returned
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button variant="outline" size="sm" icon={<Download size={14} />} onClick={handleExportCSV}>CSV</Button>
          <Button variant="outline" size="sm" icon={<FileSpreadsheet size={14} />} onClick={handleExportJSON}>JSON</Button>
        </div>
      </div>

      <Card
        title="Data View"
        headerAction={
          <div style={{ display: 'flex', gap: '0.25rem', backgroundColor: 'var(--color-bg-base)', padding: '0.2rem', borderRadius: 'var(--radius-md)' }}>
            <Button variant={chartType === 'table' ? 'primary' : 'ghost'} size="sm" icon={<TableIcon size={14} />} onClick={() => setChartType('table')}>Table</Button>
            <Button variant={chartType === 'bar' ? 'primary' : 'ghost'} size="sm" icon={<BarChart2 size={14} />} onClick={() => setChartType('bar')}>Bar</Button>
            <Button variant={chartType === 'line' ? 'primary' : 'ghost'} size="sm" icon={<LineChart size={14} />} onClick={() => setChartType('line')}>Line</Button>
            <Button variant={chartType === 'pie' ? 'primary' : 'ghost'} size="sm" icon={<PieChart size={14} />} onClick={() => setChartType('pie')}>Pie</Button>
            <Button variant={chartType === 'scatter' ? 'primary' : 'ghost'} size="sm" icon={<ScatterChart size={14} />} onClick={() => setChartType('scatter')}>Scatter</Button>
          </div>
        }
      >
        {chartType === 'table' ? (
          <div>
            <div style={{ overflowX: 'auto', maxHeight: '500px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--color-bg-elevated)', zIndex: 10 }}>
                  <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left', color: 'var(--color-text-secondary)' }}>
                    {data.columns.map((col: string) => (
                      <th key={col} style={{ padding: '0.6rem 0.5rem' }}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((row: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      {data.columns.map((col: string) => (
                        <td key={col} style={{ padding: '0.6rem 0.5rem', fontFamily: 'var(--font-mono)' }}>
                          {row[col] !== null ? String(row[col]) : <span style={{ color: 'var(--color-text-muted)' }}>NULL</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {paginatedRows.length === 0 && (
                    <tr>
                      <td colSpan={data.columns.length} style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                        No results found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', fontSize: '0.85rem' }}>
                <div style={{ color: 'var(--color-text-secondary)' }}>
                  Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, data.rowCount)} of {data.rowCount} rows
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    icon={<ChevronLeft size={14} />} 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => p - 1)}
                  >
                    Prev
                  </Button>
                  <span style={{ padding: '0 0.5rem' }}>
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    icon={<ChevronRight size={14} />} 
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ backgroundColor: 'var(--color-bg-base)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <ChartRenderer data={data} chartType={chartType} />
          </div>
        )}
      </Card>
    </div>
  );
}

export default function ResultsPage() {
  return (
    <AppLayout title="Query Results & Visualization" databaseName="Active Database">
      <Suspense fallback={<div>Loading...</div>}>
        <ResultsContent />
      </Suspense>
    </AppLayout>
  );
}
