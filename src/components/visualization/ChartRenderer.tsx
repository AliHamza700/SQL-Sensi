import React, { useMemo, useRef } from 'react';
import { Download } from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions
} from 'chart.js';
import { Bar, Line, Pie, Scatter } from 'react-chartjs-2';
import { QueryResult } from '@/src/types';
import { inferColumnTypes, ChartType } from '@/src/utils/visualization';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

interface ChartRendererProps {
  data: QueryResult;
  chartType: ChartType;
}

export function ChartRenderer({ data, chartType }: ChartRendererProps) {
  const chartRef = useRef<any>(null);

  const chartData = useMemo(() => {
    if (chartType === 'table' || data.rowCount === 0) return null;

    const metadata = inferColumnTypes(data.columns, data.rows);
    const numericCols = metadata.filter(m => m.type === 'numeric');
    const labelCols = metadata.filter(m => m.type !== 'numeric');

    if (numericCols.length === 0) return null;

    // Use the first non-numeric column as the label (or just row index if none exist)
    const labelColName = labelCols.length > 0 ? labelCols[0].name : null;
    
    // Default palette
    const bgColors = [
      'rgba(99, 102, 241, 0.6)',
      'rgba(34, 197, 94, 0.6)',
      'rgba(239, 68, 68, 0.6)',
      'rgba(234, 179, 8, 0.6)',
      'rgba(168, 85, 247, 0.6)',
    ];
    const borderColors = [
      'rgb(99, 102, 241)',
      'rgb(34, 197, 94)',
      'rgb(239, 68, 68)',
      'rgb(234, 179, 8)',
      'rgb(168, 85, 247)',
    ];

    const labels = labelColName 
      ? data.rows.map(row => String(row[labelColName] ?? 'Unknown'))
      : data.rows.map((_, i) => `Row ${i + 1}`);

    if (chartType === 'scatter') {
      // Scatter needs at least 2 numeric cols for meaningful X/Y
      if (numericCols.length < 2) return null;
      
      const xCol = numericCols[0].name;
      const yCol = numericCols[1].name;
      
      return {
        datasets: [{
          label: `${yCol} vs ${xCol}`,
          data: data.rows.map(row => ({
            x: Number(row[xCol]),
            y: Number(row[yCol])
          })),
          backgroundColor: bgColors[0],
          borderColor: borderColors[0],
        }]
      };
    }

    if (chartType === 'pie') {
      // Pie usually just plots one numeric series
      const targetCol = numericCols[0].name;
      return {
        labels,
        datasets: [{
          label: targetCol,
          data: data.rows.map(row => Number(row[targetCol])),
          backgroundColor: bgColors,
          borderColor: borderColors,
          borderWidth: 1,
        }]
      };
    }

    // Bar / Line charts can map multiple numeric columns to multiple series
    const datasets = numericCols.map((col, idx) => ({
      label: col.name,
      data: data.rows.map(row => Number(row[col.name])),
      backgroundColor: bgColors[idx % bgColors.length],
      borderColor: borderColors[idx % borderColors.length],
      borderWidth: 1,
      fill: chartType === 'line' ? false : undefined,
    }));

    return {
      labels,
      datasets
    };
  }, [data, chartType]);

  if (!chartData) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
        This data cannot be visualized as a {chartType} chart. Try selecting a different chart type or returning numeric columns.
      </div>
    );
  }

  const options: ChartOptions<any> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: 'gray'
        }
      }
    },
    scales: chartType === 'pie' ? undefined : {
      x: {
        ticks: { color: 'gray' },
        grid: { color: 'rgba(200,200,200,0.1)' }
      },
      y: {
        ticks: { color: 'gray' },
        grid: { color: 'rgba(200,200,200,0.1)' }
      }
    }
  };

  const handleExportImage = async () => {
    if (!chartRef.current) return;
    const base64Image = chartRef.current.toBase64Image();
    const electron = window.electronAPI;
    if (electron) {
      await electron.export.saveImage(base64Image, 'chart.png');
    }
  };

  return (
    <div style={{ width: '100%', height: '400px', position: 'relative' }}>
      <button 
        onClick={handleExportImage}
        style={{
          position: 'absolute', top: '0.5rem', right: '0.5rem', zIndex: 10,
          background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
          color: 'var(--color-text-secondary)', padding: '0.4rem', borderRadius: 'var(--radius-sm)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}
        title="Export Chart as PNG"
      >
        <Download size={16} />
      </button>
      {chartType === 'bar' && <Bar ref={chartRef} data={chartData as any} options={options} />}
      {chartType === 'line' && <Line ref={chartRef} data={chartData as any} options={options} />}
      {chartType === 'pie' && <Pie ref={chartRef} data={chartData as any} options={options} />}
      {chartType === 'scatter' && <Scatter ref={chartRef} data={chartData as any} options={options} />}
    </div>
  );
}
