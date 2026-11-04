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

/**
 * Categorical series colours in fixed order (validated with the dataviz palette
 * checker on the white chart surface; mirrors --chart-1…8 in globals.css).
 * Never cycled: anything past slot 8 becomes neutral "other" grey.
 */
const SERIES_COLORS = ['#0a6fa8', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const OTHER_COLOR = '#B9CFDC';
const seriesColor = (i: number) => SERIES_COLORS[i] ?? OTHER_COLOR;

/** Mirrors the text and border tokens in globals.css (Chart.js cannot read CSS variables) */
const AXIS_TEXT = '#4A6272';
const LEGEND_TEXT = '#0E2A38';
const GRID_LINE = '#E3EDF3';
const SURFACE = '#FFFFFF';

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
          backgroundColor: seriesColor(0),
          borderColor: SURFACE,
          borderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7,
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
          backgroundColor: data.rows.map((_, i) => seriesColor(i)),
          // 2px surface-coloured gap between slices
          borderColor: SURFACE,
          borderWidth: 2,
        }]
      };
    }

    // Bar / Line charts can map multiple numeric columns to multiple series
    const datasets = numericCols.map((col, idx) => ({
      label: col.name,
      data: data.rows.map(row => Number(row[col.name])),
      backgroundColor: seriesColor(idx),
      borderColor: chartType === 'line' ? seriesColor(idx) : SURFACE,
      borderWidth: chartType === 'line' ? 2 : 0,
      // Bars: rounded data end only, small gap between neighbours
      borderRadius: chartType === 'bar' ? { topLeft: 4, topRight: 4 } : undefined,
      borderSkipped: chartType === 'bar' ? ('start' as const) : undefined,
      barPercentage: 0.85,
      pointRadius: chartType === 'line' ? 4 : undefined,
      pointHoverRadius: chartType === 'line' ? 6 : undefined,
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
          color: LEGEND_TEXT,
          usePointStyle: true,
          font: { family: 'Inter, system-ui, sans-serif', size: 12 },
        }
      },
      tooltip: {
        backgroundColor: '#0E2A38',
        titleColor: '#FFFFFF',
        bodyColor: '#F2F7FA',
        padding: 10,
        cornerRadius: 8,
      }
    },
    scales: chartType === 'pie' ? undefined : {
      x: {
        ticks: { color: AXIS_TEXT },
        grid: { display: false },
        border: { color: GRID_LINE },
      },
      y: {
        ticks: { color: AXIS_TEXT },
        grid: { color: GRID_LINE },
        border: { display: false },
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
