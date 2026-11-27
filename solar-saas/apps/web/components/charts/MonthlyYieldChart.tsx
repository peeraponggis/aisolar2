'use client';

import './setup';
import { Chart as ReactChart } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import type { MonthlyYieldResult } from '@proinventive/solar-engine';
import { alpha, isPdfMode, useChartTheme } from '@/lib/chart-theme';
import { fmt } from '@/lib/format';

/** กราฟผลผลิตพลังงานรายเดือนใน 1 ปี (Yields) — ตัวที่ลูกค้าเอาไปเทียบกับใบเสนอราคา */
export default function MonthlyYieldChart({
  monthly,
  existingMonthlyKwh,
}: {
  monthly: MonthlyYieldResult;
  /** ผลผลิตรายเดือนของระบบออนกริดเดิม — ไม่ใส่ = ไม่มีระบบเดิม */
  existingMonthlyKwh?: number[] | null;
}) {
  const theme = useChartTheme();
  if (!theme) return <div className="chart-box" aria-hidden="true" />;

  const hasExisting = !!existingMonthlyKwh?.some((v) => v > 0);
  // มีระบบเดิมก็เปลี่ยนเส้นเฉลี่ยเป็นค่าเฉลี่ยของ "ผลรวมทั้งสองระบบ"
  // ไม่งั้นเส้นเฉลี่ยจะลอยต่ำกว่าแท่งทุกแท่งจนอ่านผิด
  const combinedMonthly = monthly.rows.map(
    (r, i) => r.productionKwh + (existingMonthlyKwh?.[i] ?? 0),
  );
  const avgLine = hasExisting
    ? combinedMonthly.reduce((s2, v) => s2 + v, 0) / 12
    : monthly.avgMonthlyKwh;

  const data: ChartData = {
    labels: monthly.rows.map((r) => r.label),
    datasets: [
      ...(hasExisting
        ? [
            {
              type: 'bar' as const,
              label: 'ระบบเดิม (kWh)',
              data: existingMonthlyKwh as number[],
              backgroundColor: alpha(theme.textMuted, 0.5),
              borderRadius: 4,
              stack: 'yield',
              order: 3,
            },
          ]
        : []),
      {
        type: 'bar' as const,
        label: hasExisting ? 'ระบบใหม่ (kWh)' : 'ผลผลิตพลังงาน (kWh)',
        stack: 'yield',
        data: monthly.rows.map((r) => r.productionKwh),
        backgroundColor: monthly.rows.map((r) =>
          r.month === monthly.bestMonth.month || r.month === monthly.worstMonth.month
            ? theme.chart1
            : alpha(theme.chart1, 0.55),
        ),
        borderRadius: 4,
      },
      {
        type: 'line' as const,
        label: hasExisting ? 'ค่าเฉลี่ยทั้งปี (รวมสองระบบ)' : 'ค่าเฉลี่ยทั้งปี',
        data: monthly.rows.map(() => avgLine),
        borderColor: theme.textMuted,
        borderWidth: 1.5,
        borderDash: [6, 4],
        pointRadius: 0,
        fill: false,
      },
    ],
  };

  const options: ChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    animation: isPdfMode() ? false : undefined,
    plugins: {
      legend: { labels: { color: theme.text, boxWidth: 12 } },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${fmt(Number(ctx.parsed.y))} kWh`,
        },
      },
    },
    scales: {
      x: { stacked: hasExisting, grid: { display: false }, ticks: { color: theme.textMuted } },
      y: {
        stacked: hasExisting,
        beginAtZero: true,
        grid: { color: alpha(theme.border, 0.5) },
        ticks: { color: theme.textMuted },
        title: { display: true, text: 'kWh', color: theme.textMuted },
      },
    },
  };

  return (
    <div className="chart-box">
      <ReactChart type="bar" data={data} options={options} />
    </div>
  );
}
