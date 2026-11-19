import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, Building2, Clock, Flame } from 'lucide-react';
import type { AnalyticsSummary, HeatmapCell } from '../types/hospital';
import { SectionHeader } from './SectionHeader';

interface AdmissionsDemandViewProps {
  summary: AnalyticsSummary;
}

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function AdmissionsDemandView({ summary }: AdmissionsDemandViewProps) {
  const [hoveredCell, setHoveredCell] = useState<HeatmapCell | null>(null);
  const { dailySeries, heatmap, departmentStats, kpis } = summary;

  // Aggregate dailySeries by week if > 65 days for crisp readable line/area charts
  const chartSeries = useMemo(() => {
    if (dailySeries.length <= 65) return dailySeries;
    const buckets: {
      label: string;
      date: string;
      admissions: number;
      avgWaitMinutes: number;
    }[] = [];
    for (let i = 0; i < dailySeries.length; i += 7) {
      const slice = dailySeries.slice(i, i + 7);
      const totalAdm = slice.reduce((s, d) => s + d.admissions, 0);
      const weightedWait = slice.reduce((s, d) => s + d.avgWaitMinutes * d.admissions, 0);
      buckets.push({
        label: slice[0].label,
        date: `${slice[0].date} to ${slice[slice.length - 1].date}`,
        admissions: totalAdm,
        avgWaitMinutes: totalAdm > 0 ? Math.round((weightedWait / totalAdm) * 10) / 10 : 0,
      });
    }
    return buckets;
  }, [dailySeries]);

  const isWeekly = dailySeries.length > 65;

  const maxHeatmapCount = useMemo(
    () => Math.max(1, ...heatmap.map((c) => c.count)),
    [heatmap]
  );

  const peakCell = useMemo(
    () => [...heatmap].sort((a, b) => b.count - a.count)[0],
    [heatmap]
  );

  const heatmapGrid = useMemo(() => {
    const map = new Map<string, HeatmapCell>();
    for (const c of heatmap) {
      map.set(`${c.dayIndex}-${c.hour}`, c);
    }
    return map;
  }, [heatmap]);

  const getHeatmapCellColor = (count: number) => {
    if (count === 0) return '#F3F4F6';
    const ratio = count / maxHeatmapCount;
    if (ratio >= 0.75) return '#0A2E36';
    if (ratio >= 0.5) return '#02808F';
    if (ratio >= 0.25) return '#00A795';
    return '#99DDD5';
  };

  const highlightCards = [
    {
      bg: '#02808F',
      icon: Activity,
      title: 'Filtered Volume',
      value: `${kpis.totalAdmissions.toLocaleString()} Admits`,
      note: isWeekly ? 'Charts grouped weekly for clarity' : 'Daily resolution active',
    },
    {
      bg: '#00A795',
      icon: Clock,
      title: 'Mean Wait Duration',
      value: `${kpis.avgWaitMinutes} Minutes`,
      note: `Fastest: ${[...departmentStats].sort((a, b) => a.avgWaitMinutes - b.avgWaitMinutes)[0]?.department ?? 'N/A'}`,
    },
    {
      bg: '#02808F',
      icon: Flame,
      title: 'Peak Arrival Slot',
      value: peakCell
        ? `${peakCell.dayLabel} ${String(peakCell.hour).padStart(2, '0')}:00`
        : 'N/A',
      note: peakCell ? `${peakCell.count} visits (${peakCell.avgWaitMinutes}m avg wait)` : '',
    },
    {
      bg: '#00A795',
      icon: Building2,
      title: 'Highest-Demand Unit',
      value: departmentStats[0]?.department ?? 'N/A',
      note: departmentStats[0]
        ? `${departmentStats[0].admissions} visits (${departmentStats[0].sharePct}%)`
        : '',
    },
  ];

  return (
    <section aria-labelledby="section-admissions-heading" className="space-y-10">
      <SectionHeader
        number="01"
        title="Admissions, Wait Times & Demand"
        subtitle="Arrival throughput, department volume distribution, wait-time trends, and Day-of-Week × Hour demand intensity"
      />

      {/* 4 Alternating Summary Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {highlightCards.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.title}
              style={{ backgroundColor: c.bg }}
              className="rounded-md p-6 text-white shadow-sm"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0A2E36] text-white">
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-4 text-xs font-semibold tracking-wider text-white/85 uppercase">
                {c.title}
              </p>
              <p className="font-tabular mt-1.5 text-2xl font-bold text-white">{c.value}</p>
              <p className="mt-1.5 text-sm text-white/90">{c.note}</p>
            </div>
          );
        })}
      </div>

      {/* Row 1: Admissions Over Time & Wait Time Trend */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="rounded-md border border-[#E5E7EB] bg-white p-6">
          <div className="mb-4 flex items-baseline justify-between gap-2">
            <div>
              <h3 className="font-editorial-serif text-xl font-bold text-[#1B1B2F]">
                Admissions Volume Over Time
              </h3>
              <p className="text-xs italic text-[#6B7280]">
                {isWeekly ? '7-day aggregated arrival totals' : 'Daily hospital intake trajectory'}
              </p>
            </div>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartSeries} margin={{ top: 10, right: 16, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="admAreaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#02808F" stopOpacity={0.32} />
                    <stop offset="95%" stopColor="#02808F" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="label" tick={{ fill: '#6B7280', fontSize: 11 }} />
                <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0A2E36',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#FFFFFF',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="admissions"
                  name="Admissions"
                  stroke="#02808F"
                  strokeWidth={2.5}
                  fill="url(#admAreaFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-md border border-[#E5E7EB] bg-white p-6">
          <div className="mb-4">
            <h3 className="font-editorial-serif text-xl font-bold text-[#1B1B2F]">
              Average Wait Time Trend (Minutes)
            </h3>
            <p className="text-xs italic text-[#6B7280]">
              Arrival-to-clinician latency across {isWeekly ? 'weekly intervals' : 'daily arrivals'}
            </p>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartSeries} margin={{ top: 10, right: 16, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="label" tick={{ fill: '#6B7280', fontSize: 11 }} />
                <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} unit="m" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0A2E36',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#FFFFFF',
                    fontSize: '12px',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="avgWaitMinutes"
                  name="Avg Wait (min)"
                  stroke="#00A795"
                  strokeWidth={2.5}
                  dot={chartSeries.length <= 35 ? { r: 3, fill: '#0A2E36' } : false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row 2: Admissions by Department & Day x Hour Heatmap */}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
        <div className="rounded-md border border-[#E5E7EB] bg-white p-6 xl:col-span-5">
          <h3 className="font-editorial-serif text-xl font-bold text-[#1B1B2F]">
            Admissions by Department
          </h3>
          <p className="mb-4 text-xs italic text-[#6B7280]">
            Alternating unit volume comparison (hover for wait averages)
          </p>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={departmentStats}
                layout="vertical"
                margin={{ top: 4, right: 20, left: 20, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#6B7280', fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="department"
                  width={118}
                  tick={{ fill: '#1B1B2F', fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0A2E36',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#FFFFFF',
                    fontSize: '12px',
                  }}
                  formatter={(value: unknown, _name: unknown, props: { payload?: { avgWaitMinutes?: number } }) => [
                    `${value} admissions (${props.payload?.avgWaitMinutes ?? 0}m avg wait)`,
                    'Volume',
                  ]}
                />
                <Bar dataKey="admissions" radius={[0, 4, 4, 0]}>
                  {departmentStats.map((entry, idx) => (
                    <Cell
                      key={entry.department}
                      fill={idx % 2 === 0 ? '#02808F' : '#00A795'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-md border border-[#E5E7EB] bg-white p-6 xl:col-span-7">
          <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <h3 className="font-editorial-serif text-xl font-bold text-[#1B1B2F]">
                Demand Heatmap: Day of Week × Arrival Hour
              </h3>
              <p className="text-xs italic text-[#6B7280]">
                {hoveredCell
                  ? `${hoveredCell.dayLabel} ${String(hoveredCell.hour).padStart(2, '0')}:00 — ${hoveredCell.count} admissions (${hoveredCell.avgWaitMinutes}m avg wait)`
                  : 'Hover any cell to inspect hourly arrival volume and wait latency'}
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-[#6B7280]">
              <span>Low</span>
              <span className="h-3 w-4 rounded-xs bg-[#F3F4F6] border border-[#E5E7EB]" />
              <span className="h-3 w-4 rounded-xs bg-[#99DDD5]" />
              <span className="h-3 w-4 rounded-xs bg-[#00A795]" />
              <span className="h-3 w-4 rounded-xs bg-[#02808F]" />
              <span className="h-3 w-4 rounded-xs bg-[#0A2E36]" />
              <span>Peak</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[600px]">
              <div className="mb-1.5 grid grid-cols-[44px_repeat(24,minmax(0,1fr))] gap-1 text-center font-tabular text-[10px] text-[#6B7280]">
                <div />
                {HOURS.map((h) => (
                  <div key={h}>{h % 3 === 0 ? String(h).padStart(2, '0') : ''}</div>
                ))}
              </div>
              <div className="space-y-1">
                {DAY_ORDER.map((dayName, dayIdx) => (
                  <div
                    key={dayName}
                    className="grid grid-cols-[44px_repeat(24,minmax(0,1fr))] items-center gap-1"
                  >
                    <span className="text-xs font-semibold text-[#1B1B2F]">{dayName}</span>
                    {HOURS.map((h) => {
                      const cell = heatmapGrid.get(`${dayIdx}-${h}`);
                      const count = cell?.count ?? 0;
                      const bg = getHeatmapCellColor(count);
                      const isDark = count / maxHeatmapCount >= 0.25;
                      return (
                        <button
                          key={h}
                          type="button"
                          onMouseEnter={() => cell && setHoveredCell(cell)}
                          onFocus={() => cell && setHoveredCell(cell)}
                          aria-label={`${dayName} ${String(h).padStart(2, '0')}:00, ${count} admissions`}
                          style={{ backgroundColor: bg }}
                          className={`font-tabular flex h-7 items-center justify-center rounded-[3px] text-[10px] font-medium transition-transform hover:scale-110 focus:outline-2 focus:outline-[#0A2E36] ${
                            isDark ? 'text-white' : 'text-[#6B7280]'
                          }`}
                        >
                          {count > 0 ? count : ''}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
