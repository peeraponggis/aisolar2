'use client';

import './setup';
import { Chart as ReactChart } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import type { CashFlowRow } from '@proinventive/solar-engine';
import { alpha, isPdfMode, useChartTheme } from '@/lib/chart-theme';
import { baht } from '@/lib/format';

/** กระแสเงินสดสะสม — ปี 0 คือเงินลงทุน (ติดลบ) แล้วไล่ตามผลของแต่ละปี */
export default function CashFlowChart({
  investment,
  rows,
}: {
  investment: number;
  rows: CashFlowRow[];
}) {
  const theme = useChartTheme();
  if (!theme) return <div className="chart-box" aria-hidden="true" />;

  const values = [-investment, ...rows.map((r) => r.cumulativeDcf)];

  const data: ChartData = {
    labels: values.map((_, year) => `ปี ${year}`),
    datasets: [
      {
        type: 'bar' as const,
        label: 'กระแสเงินสดสะสม',
        data: values,
        backgroundColor: values.map((v) => (v >= 0 ? theme.chart1 : alpha(theme.chartNeg, 0.9))),
        borderRadius: 3,
      },
    ],
  };

  const options: ChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: isPdfMode() ? false : undefined,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx) => baht(Number(ctx.parsed.y)) } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: theme.textMuted, maxRotation: 0, autoSkip: true } },
      y: {
        grid: { color: alpha(theme.border, 0.5) },
        ticks: {
          color: theme.textMuted,
          callback: (v) => `${Math.round(Number(v) / 1000).toLocaleString('th-TH')}k`,
        },
        title: { display: true, text: 'บาท', color: theme.textMuted },
      },
    },
  };

  return (
    <div className="chart-box">
      <ReactChart type="bar" data={data} options={options} />
    </div>
  );
}
