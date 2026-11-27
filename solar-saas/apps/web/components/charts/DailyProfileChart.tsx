'use client';

import './setup';
import { Chart as ReactChart } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import type { DailyProfileResult } from '@proinventive/solar-engine';
import { alpha, isPdfMode, useChartTheme } from '@/lib/chart-theme';
import { fmt } from '@/lib/format';

const PSH_BAND_LABEL = 'ช่วง PSH (แดดจัด)';

/**
 * กราฟกำลังผลิตของระบบและการทำงานของแบตเตอรี่ตลอด 24 ชั่วโมง
 * ตอบคำถามที่ลูกค้าถามบ่อยที่สุด — "กลางคืนไฟจะพอถึงกี่โมง"
 */
export default function DailyProfileChart({
  daily,
  hasBattery,
  existingSolarKw,
}: {
  daily: DailyProfileResult;
  hasBattery: boolean;
  /** กำลังผลิตของระบบออนกริดเดิมรายชั่วโมง (kW) — ไม่ใส่ = ไม่มีระบบเดิม */
  existingSolarKw?: number[] | null;
}) {
  const theme = useChartTheme();
  if (!theme) return <div className="chart-box" aria-hidden="true" />;

  const labels = daily.points.map((p) => `${String(p.hour % 24).padStart(2, '0')}:00`);
  const hasExisting = !!existingSolarKw?.some((v) => v > 0);
  // แถบ PSH ต้องสูงคลุมเส้นที่สูงที่สุดในกราฟ ซึ่งอาจเป็นเส้นรวมสองระบบ
  const maxSolar = Math.max(
    ...daily.points.map((p, i) => p.solarKw + (hasExisting ? (existingSolarKw?.[i] ?? 0) : 0)),
    0.1,
  );
  const bandHeight = maxSolar * 1.25;

  const data: ChartData = {
    labels,
    datasets: [
      {
        type: 'bar' as const,
        label: PSH_BAND_LABEL,
        data: daily.points.map((p) =>
          p.hour >= daily.window.pshStartHour && p.hour <= daily.window.pshEndHour ? bandHeight : 0,
        ),
        backgroundColor: alpha(theme.accent, 0.13),
        barPercentage: 1,
        categoryPercentage: 1,
        order: 5,
      },
      {
        type: 'line' as const,
        label: 'กำลังผลิตโซลาร์ (kW)',
        data: daily.points.map((p) => p.solarKw),
        borderColor: theme.chart1,
        backgroundColor: alpha(theme.chart1, 0.18),
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        order: 1,
      },
      ...(hasExisting
        ? [
            {
              type: 'line' as const,
              label: 'ระบบเดิม (kW)',
              data: daily.points.map((_, i) => existingSolarKw?.[i] ?? 0),
              borderColor: theme.textMuted,
              borderWidth: 1.5,
              fill: false,
              tension: 0.4,
              pointRadius: 0,
              order: 1,
            },
            {
              type: 'line' as const,
              label: 'รวมสองระบบ (kW)',
              data: daily.points.map((p, i) => p.solarKw + (existingSolarKw?.[i] ?? 0)),
              borderColor: theme.accent,
              borderWidth: 2,
              borderDash: [3, 3],
              fill: false,
              tension: 0.4,
              pointRadius: 0,
              order: 0,
            },
          ]
        : []),
      {
        type: 'line' as const,
        label: 'โหลดที่ใช้จริง (kW)',
        data: daily.points.map((p) => p.loadKw),
        borderColor: theme.textMuted,
        borderWidth: 1.5,
        borderDash: [5, 4],
        fill: false,
        stepped: true as const,
        pointRadius: 0,
        order: 2,
      },
      ...(hasBattery
        ? [
            {
              type: 'line' as const,
              label: 'ชาร์จแบต (+)',
              data: daily.points.map((p) => p.chargeKw),
              borderColor: theme.chart3,
              borderWidth: 2,
              fill: false,
              tension: 0.3,
              pointRadius: 0,
              order: 3,
            },
            {
              type: 'line' as const,
              label: 'ใช้ไฟจากแบต (−)',
              data: daily.points.map((p) => p.dischargeKw),
              // ห้ามใช้ accent — ในธีม solar-amber มีค่าเท่ากับ chart-1 ของเส้นโซลาร์
              // สองเส้นจะกลายเป็นสีเดียวกันจนอ่านกราฟไม่ออก
              borderColor: theme.chart2,
              borderWidth: 2,
              fill: false,
              tension: 0.3,
              pointRadius: 0,
              order: 4,
            },
          ]
        : []),
    ],
  };

  const options: ChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    animation: isPdfMode() ? false : undefined,
    plugins: {
      legend: {
        labels: { color: theme.text, boxWidth: 12, filter: (l) => l.text !== PSH_BAND_LABEL },
      },
      tooltip: {
        // ซ่อนแถบพื้นหลัง PSH ออกจาก tooltip — เป็นแค่ตัวช่วยอ่านกราฟ ไม่ใช่ข้อมูล
        filter: (ctx) => ctx.dataset.label !== PSH_BAND_LABEL,
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${fmt(Number(ctx.parsed.y), 2)} kW`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: alpha(theme.border, 0.5) },
        ticks: { color: theme.textMuted, maxTicksLimit: 13, autoSkip: true },
      },
      y: {
        grid: { color: alpha(theme.border, 0.5) },
        ticks: { color: theme.textMuted },
        title: { display: true, text: 'กำลังไฟฟ้า (kW)', color: theme.textMuted },
      },
    },
  };

  return (
    <div className="chart-box">
      <ReactChart type="line" data={data} options={options} />
    </div>
  );
}
