import { useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, BedDouble, CalendarClock, TrendingUp } from 'lucide-react';
import type { AnalyticsSummary, CapacityConfig } from '../types/hospital';
import { SectionHeader } from './SectionHeader';

interface BottlenecksForecastViewProps {
  summary: AnalyticsSummary;
  config: CapacityConfig;
  forecastHorizonDays: number;
  onChangeForecastHorizon: (days: number) => void;
}

type ForecastMetricMode = 'admissions' | 'occupancy' | 'staffing';

export function BottlenecksForecastView({
  summary,
  config,
  forecastHorizonDays,
  onChangeForecastHorizon,
}: BottlenecksForecastViewProps) {
  const [forecastMetric, setForecastMetric] = useState<ForecastMetricMode>('admissions');
  const [alertFilter, setAlertFilter] = useState<'all' | 'critical' | 'warning'>('all');

  const { dailySeries, bottleneckAlerts, forecasts, kpis } = summary;

  // Compact occupancy series for readability
  const occupancyChartData = useMemo(() => {
    if (dailySeries.length <= 120) return dailySeries;
    // Show last 90 days or peak-preserving 3-day buckets
    const buckets: {
      label: string;
      date: string;
      bedOccupancyPct: number;
      bedCensus: number;
      isOccupancySpike: boolean;
    }[] = [];
    for (let i = 0; i < dailySeries.length; i += 3) {
      const slice = dailySeries.slice(i, i + 3);
      const peakDay = [...slice].sort((a, b) => b.bedOccupancyPct - a.bedOccupancyPct)[0];
      buckets.push({
        label: peakDay.label,
        date: peakDay.date,
        bedOccupancyPct: peakDay.bedOccupancyPct,
        bedCensus: peakDay.bedCensus,
        isOccupancySpike: peakDay.isOccupancySpike,
      });
    }
    return buckets;
  }, [dailySeries]);

  // Shape forecast chart series with shaded confidence band [lower, upper]
  const forecastChartData = useMemo(() => {
    return forecasts.map((pt) => {
      if (forecastMetric === 'occupancy') {
        const lower = pt.occupancyLowerPct ?? pt.actualOccupancyPct ?? 0;
        const upper = pt.occupancyUpperPct ?? pt.actualOccupancyPct ?? 0;
        return {
          label: pt.label,
          date: pt.date,
          actual: pt.actualOccupancyPct,
          predicted: pt.predictedOccupancyPct,
          bandBase: pt.isForecast ? lower : null,
          bandSpan: pt.isForecast ? Math.max(0, Math.round((upper - lower) * 10) / 10) : null,
          lower,
          upper,
          isForecast: pt.isForecast,
        };
      }
      if (forecastMetric === 'staffing') {
        const lower = pt.staffLower ?? pt.actualStaffCount ?? 0;
        const upper = pt.staffUpper ?? pt.actualStaffCount ?? 0;
        return {
          label: pt.label,
          date: pt.date,
          actual: pt.actualStaffCount,
          predicted: pt.predictedStaffNeeded,
          bandBase: pt.isForecast ? lower : null,
          bandSpan: pt.isForecast ? Math.max(0, Math.round((upper - lower) * 10) / 10) : null,
          lower,
          upper,
          isForecast: pt.isForecast,
        };
      }
      const lower = pt.admissionsLower ?? pt.actualAdmissions ?? 0;
      const upper = pt.admissionsUpper ?? pt.actualAdmissions ?? 0;
      return {
        label: pt.label,
        date: pt.date,
        actual: pt.actualAdmissions,
        predicted: pt.predictedAdmissions,
        bandBase: pt.isForecast ? lower : null,
        bandSpan: pt.isForecast ? Math.max(0, Math.round((upper - lower) * 10) / 10) : null,
        lower,
        upper,
        isForecast: pt.isForecast,
      };
    });
  }, [forecasts, forecastMetric]);

  const futurePoints = forecasts.filter((f) => f.isForecast);
  const avgProjAdm = futurePoints.length
    ? (
        futurePoints.reduce((s, f) => s + (f.predictedAdmissions ?? 0), 0) / futurePoints.length
      ).toFixed(1)
    : '0';
  const peakProjOcc = futurePoints.length
    ? Math.max(...futurePoints.map((f) => f.predictedOccupancyPct ?? 0)).toFixed(1)
    : '0';
  const avgProjStaff = futurePoints.length
    ? (
        futurePoints.reduce((s, f) => s + (f.predictedStaffNeeded ?? 0), 0) / futurePoints.length
      ).toFixed(1)
    : '0';

  const filteredAlerts = useMemo(() => {
    if (alertFilter === 'all') return bottleneckAlerts;
    return bottleneckAlerts.filter((a) => a.severity === alertFilter);
  }, [bottleneckAlerts, alertFilter]);

  const summaryCards = [
    {
      bg: '#02808F',
      icon: BedDouble,
      title: 'Peak Bed Occupancy',
      value: `${kpis.peakBedOccupancyPct}%`,
      note: `${kpis.occupancySpikeDays} days >= ${config.occupancyWarningPct}% spike threshold`,
    },
    {
      bg: '#00A795',
      icon: AlertTriangle,
      title: 'Active Operational Alerts',
      value: `${bottleneckAlerts.length} Flagged`,
      note: `${bottleneckAlerts.filter((a) => a.severity === 'critical').length} critical · ${bottleneckAlerts.filter((a) => a.severity === 'warning').length} warning`,
    },
    {
      bg: '#02808F',
      icon: TrendingUp,
      title: `${forecastHorizonDays}d Est. Admissions`,
      value: `${avgProjAdm} / day`,
      note: `Projected peak occupancy ${peakProjOcc}% (Estimate)`,
    },
    {
      bg: '#00A795',
      icon: CalendarClock,
      title: `${forecastHorizonDays}d Est. Staffing Need`,
      value: `${avgProjStaff} MD / day`,
      note: `Calibrated to ${config.targetPatientsPerClinician}:1 target load (Estimate)`,
    },
  ];

  const metricLabel =
    forecastMetric === 'admissions'
      ? 'Daily Admissions'
      : forecastMetric === 'occupancy'
      ? 'Bed Occupancy %'
      : 'Clinicians Required';

  return (
    <section aria-labelledby="section-bottlenecks-heading" className="space-y-10">
      <SectionHeader
        number="03"
        title="Bottlenecks & Predictive Forecasting"
        subtitle="Bed capacity surge detection, understaffed-shift alerts, and seasonal linear projections with 90% confidence bands"
      />

      {/* 4 Alternating Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((c) => {
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

      {/* Interactive Forecast Panel */}
      <div className="rounded-md border border-[#E5E7EB] bg-white p-6">
        <div className="mb-6 flex flex-col gap-4 border-b border-[#E5E7EB] pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="font-editorial-serif text-2xl font-bold text-[#1B1B2F]">
                {forecastHorizonDays}-Day Resource & Demand Forecast
              </h3>
              <span className="rounded bg-[#0A2E36] px-2.5 py-0.5 text-[11px] font-semibold tracking-wider text-white uppercase">
                Statistical Estimate (90% Confidence Band)
              </span>
            </div>
            <p className="mt-1 text-xs italic text-[#6B7280]">
              Recent 30-day actual baseline paired with Day-of-Week seasonal linear regression projections for {metricLabel}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* Metric Switcher */}
            <div className="inline-flex rounded-md border border-[#E5E7EB] bg-white p-1" role="group" aria-label="Forecast metric selector">
              {(
                [
                  ['admissions', 'Admissions'],
                  ['occupancy', 'Occupancy %'],
                  ['staffing', 'Staffing Needs'],
                ] as [ForecastMetricMode, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setForecastMetric(key)}
                  className={`rounded px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                    forecastMetric === key
                      ? 'bg-[#02808F] text-white'
                      : 'text-[#1B1B2F] hover:bg-[#F3F4F6]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Horizon Adjuster */}
            <div className="flex items-center gap-2.5">
              <label
                htmlFor="forecast-horizon-select"
                className="text-xs font-semibold text-[#1B1B2F] whitespace-nowrap"
              >
                Horizon:
              </label>
              <select
                id="forecast-horizon-select"
                value={forecastHorizonDays}
                onChange={(e) => onChangeForecastHorizon(Number(e.target.value))}
                className="font-tabular rounded-md border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-semibold text-[#0A2E36]"
              >
                <option value={7}>7 Days</option>
                <option value={14}>14 Days (Default)</option>
                <option value={21}>21 Days</option>
                <option value={30}>30 Days</option>
              </select>
            </div>
          </div>
        </div>

        <div className="h-80 w-full" data-testid="forecast-chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={forecastChartData}
              margin={{ top: 10, right: 20, left: -8, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="label" tick={{ fill: '#6B7280', fontSize: 11 }} />
              <YAxis
                tick={{ fill: '#6B7280', fontSize: 11 }}
                unit={forecastMetric === 'occupancy' ? '%' : ''}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0A2E36',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#FFFFFF',
                  fontSize: '12px',
                }}
                formatter={(value: unknown, name: unknown, item: { payload?: { lower?: number; upper?: number; isForecast?: boolean } }) => {
                  if (name === 'bandBase' || name === 'bandSpan') return [null, null];
                  const suffix = forecastMetric === 'occupancy' ? '%' : '';
                  if (item?.payload?.isForecast && name === 'Projected Estimate') {
                    return [
                      `${value}${suffix} (90% CI: ${item.payload.lower}–${item.payload.upper}${suffix})`,
                      'Projected Estimate',
                    ];
                  }
                  return [`${value}${suffix}`, String(name)];
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Area
                type="monotone"
                dataKey="bandBase"
                stackId="ci"
                stroke="none"
                fill="transparent"
                legendType="none"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="bandSpan"
                name="90% Confidence Band (Est.)"
                stackId="ci"
                stroke="none"
                fill="#00A795"
                fillOpacity={0.22}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="actual"
                name="Historical Actual"
                stroke="#0A2E36"
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="predicted"
                name="Projected Estimate"
                stroke="#02808F"
                strokeWidth={2.5}
                strokeDasharray="6 4"
                dot={{ r: 3, fill: '#02808F' }}
                connectNulls={false}
              />
              {forecastMetric === 'occupancy' ? (
                <ReferenceLine
                  y={config.occupancyWarningPct}
                  stroke="#02808F"
                  strokeDasharray="3 3"
                  label={{
                    value: `${config.occupancyWarningPct}% Alert`,
                    fill: '#02808F',
                    fontSize: 11,
                    position: 'insideTopLeft',
                  }}
                />
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bed Occupancy Trend & Understaffed / Spike Alerts Table */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="rounded-md border border-[#E5E7EB] bg-white p-6 lg:col-span-5">
          <h3 className="font-editorial-serif text-xl font-bold text-[#1B1B2F]">
            Bed Occupancy & Spike Detection
          </h3>
          <p className="mb-4 text-xs italic text-[#6B7280]">
            Peak census percentage against {config.occupancyWarningPct}% warning & {config.occupancyCriticalPct}% critical lines
          </p>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={occupancyChartData}
                margin={{ top: 10, right: 16, left: -12, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="label" tick={{ fill: '#6B7280', fontSize: 11 }} />
                <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} unit="%" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0A2E36',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#FFFFFF',
                    fontSize: '12px',
                  }}
                />
                <ReferenceLine
                  y={config.occupancyWarningPct}
                  stroke="#00A795"
                  strokeDasharray="4 4"
                />
                <ReferenceLine
                  y={config.occupancyCriticalPct}
                  stroke="#0A2E36"
                  strokeDasharray="4 4"
                />
                <Area
                  type="monotone"
                  dataKey="bedOccupancyPct"
                  name="Bed Occupancy %"
                  stroke="#02808F"
                  fill="#02808F"
                  fillOpacity={0.18}
                  strokeWidth={2}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-md border border-[#E5E7EB] bg-white p-6 lg:col-span-7">
          <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h3 className="font-editorial-serif text-xl font-bold text-[#1B1B2F]">
                Operational Bottleneck & Shift Alerts
              </h3>
              <p className="text-xs italic text-[#6B7280]">
                Prioritized log of occupancy spikes, understaffed shifts, and wait-time surges
              </p>
            </div>
            <div className="inline-flex rounded-md border border-[#E5E7EB] p-1">
              {(['all', 'critical', 'warning'] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setAlertFilter(level)}
                  className={`rounded px-2.5 py-1 text-xs font-semibold capitalize whitespace-nowrap ${
                    alertFilter === level
                      ? 'bg-[#0A2E36] text-white'
                      : 'text-[#6B7280] hover:text-[#1B1B2F]'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-80 overflow-auto rounded-md border border-[#E5E7EB]">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-[#0A2E36] text-white uppercase">
                <tr>
                  <th className="px-3 py-2.5">Date / Shift</th>
                  <th className="px-3 py-2.5">Unit</th>
                  <th className="px-3 py-2.5">Observed Metric</th>
                  <th className="px-3 py-2.5">Severity</th>
                  <th className="px-3 py-2.5">Recommended Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {filteredAlerts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-[#6B7280]">
                      No bottleneck alerts match the selected filter.
                    </td>
                  </tr>
                ) : (
                  filteredAlerts.slice(0, 50).map((alert) => (
                    <tr key={alert.id} className="hover:bg-[#F8FAFC]">
                      <td className="font-tabular whitespace-nowrap px-3 py-2.5 font-medium text-[#1B1B2F]">
                        {alert.date} · {alert.shift}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-[#02808F]">
                        {alert.department}
                      </td>
                      <td className="font-tabular px-3 py-2.5 text-[#1B1B2F]">
                        <div>{alert.metricValue}</div>
                        <div className="text-[11px] text-[#6B7280]">vs {alert.thresholdValue}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`font-semibold uppercase ${
                            alert.severity === 'critical' ? 'text-[#0A2E36]' : 'text-[#02808F]'
                          }`}
                        >
                          {alert.severity}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[#6B7280]">{alert.recommendedAction}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
