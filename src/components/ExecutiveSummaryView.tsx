import {
  Activity,
  ArrowRight,
  BedDouble,
  Clock,
  Download,
  FileText,
  Printer,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import type { AnalyticsSummary, CapacityConfig, DashboardTab } from '../types/hospital';
import { SectionHeader } from './SectionHeader';

interface ExecutiveSummaryViewProps {
  summary: AnalyticsSummary;
  config: CapacityConfig;
  forecastHorizonDays: number;
  onNavigateTab: (tab: DashboardTab) => void;
  onExportSummaryCsv: () => void;
}

export function ExecutiveSummaryView({
  summary,
  config,
  forecastHorizonDays,
  onNavigateTab,
  onExportSummaryCsv,
}: ExecutiveSummaryViewProps) {
  const { kpis, insights, departmentStats, forecasts } = summary;
  const futureForecasts = forecasts.filter((f) => f.isForecast);
  const avgProjAdm = futureForecasts.length
    ? (
        futureForecasts.reduce((s, f) => s + (f.predictedAdmissions ?? 0), 0) /
        futureForecasts.length
      ).toFixed(1)
    : '0';

  const kpiCards = [
    {
      id: 'kpi-admissions',
      bg: '#02808F',
      icon: Activity,
      label: 'Total Admissions',
      value: kpis.totalAdmissions.toLocaleString(),
      detail: `${kpis.dateSpanLabel} · ${departmentStats.length} active units`,
    },
    {
      id: 'kpi-wait',
      bg: '#00A795',
      icon: Clock,
      label: 'Average Wait Time',
      value: `${kpis.avgWaitMinutes} min`,
      detail: `CSAT ${kpis.avgSatisfaction}/5.0 · ${kpis.readmissionRatePct}% 30d readmission`,
    },
    {
      id: 'kpi-occupancy',
      bg: '#02808F',
      icon: BedDouble,
      label: 'Bed Occupancy Rate',
      value: `${kpis.avgBedOccupancyPct}%`,
      detail: `Peak ${kpis.peakBedOccupancyPct}% (${kpis.occupancySpikeDays} spike days >= ${config.occupancyWarningPct}%)`,
    },
    {
      id: 'kpi-overtime',
      bg: '#00A795',
      icon: Wallet,
      label: 'Est. Overtime Cost',
      value: `₦${Math.round(kpis.estimatedOvertimeCostNgn / 1000).toLocaleString()}k`,
      detail: `${kpis.estimatedOvertimeHours.toLocaleString()} hrs @ ₦${config.overtimeRateNgnPerHour.toLocaleString()}/hr`,
    },
  ];

  const capabilityCards = [
    {
      num: '01',
      tab: 'admissions' as DashboardTab,
      bg: '#02808F',
      icon: Activity,
      title: 'Admissions, Wait Times & Demand',
      summary: `Top volume unit is ${departmentStats[0]?.department ?? 'N/A'} (${departmentStats[0]?.admissions ?? 0} visits). View arrival heatmaps across 168 Day × Hour slots and department wait benchmarks.`,
      cta: 'Inspect Demand & Waits',
    },
    {
      num: '02',
      tab: 'workload' as DashboardTab,
      bg: '#00A795',
      icon: Users,
      title: 'Staff Workload & Efficiency',
      summary: `Average active patient-to-clinician ratio is ${kpis.avgPatientToStaffRatio}:1 with ${kpis.understaffedAlertCount} shift pressure windows flagged across Morning, Afternoon, and Night coverage.`,
      cta: 'Inspect Staff Efficiency',
    },
    {
      num: '03',
      tab: 'bottlenecks' as DashboardTab,
      bg: '#02808F',
      icon: TrendingUp,
      title: 'Bottlenecks & Forecasting',
      summary: `${forecastHorizonDays}-day statistical estimate projects ${avgProjAdm} daily admissions ahead alongside ${kpis.occupancySpikeDays} historical bed surge intervals requiring discharge acceleration.`,
      cta: 'Open Forecasts & Alerts',
    },
    {
      num: '04',
      tab: 'insights' as DashboardTab,
      bg: '#00A795',
      icon: FileText,
      title: 'Executive Performance Audit',
      summary: `Operational briefing synthesized from ${kpis.totalAdmissions.toLocaleString()} validated encounters. Export department scorecards or print leadership board packets below.`,
      cta: 'View Narrative Insights',
    },
  ];

  return (
    <section aria-labelledby="section-insights-heading" className="space-y-10">
      <SectionHeader
        number="04"
        title="Insights & Executive Dashboard"
        subtitle="Hospital leadership performance overview, alternating KPI scorecards, and actionable operational briefings"
        rightSlot={
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onExportSummaryCsv}
              className="inline-flex items-center gap-2 rounded-md border border-[#02808F] bg-white px-4 py-2 text-sm font-medium text-[#02808F] whitespace-nowrap shrink-0 transition-colors hover:bg-[#02808F] hover:text-white"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-md bg-[#0A2E36] px-4 py-2 text-sm font-medium text-white whitespace-nowrap shrink-0 transition-opacity hover:opacity-90"
            >
              <Printer className="h-4 w-4" />
              Print Briefing
            </button>
          </div>
        }
      />

      {/* 4 Alternating Teal KPI Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.id}
              data-testid={card.id}
              style={{ backgroundColor: card.bg }}
              className="print-break-inside-avoid rounded-md p-6 text-white shadow-sm"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0A2E36] text-white">
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-5 text-sm font-semibold tracking-wide text-white/90 uppercase">
                {card.label}
              </p>
              <p className="font-tabular mt-2 text-3xl font-bold tracking-tight text-white">
                {card.value}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-white/90">{card.detail}</p>
            </div>
          );
        })}
      </div>

      {/* 4 Alternating Capability Overview Panels */}
      <div>
        <div className="mb-4 flex items-baseline justify-between">
          <h3 className="font-editorial-serif text-2xl font-bold text-[#1B1B2F]">
            What Your Analysis Delivers
          </h3>
          <span className="text-xs italic text-[#6B7280]">
            Select any pillar to drill into interactive analytics
          </span>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          {capabilityCards.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.num}
                style={{ backgroundColor: item.bg }}
                className="print-break-inside-avoid flex flex-col justify-between rounded-md p-6 text-white shadow-sm"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0A2E36] text-white">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="font-tabular text-xs font-bold tracking-[0.2em] text-white/80">
                      {item.num}
                    </span>
                  </div>
                  <h4 className="mt-5 text-lg font-bold leading-snug text-white">
                    {item.title}
                  </h4>
                  <p className="mt-2.5 text-sm leading-relaxed text-white/90">{item.summary}</p>
                </div>
                {item.tab !== 'insights' ? (
                  <button
                    type="button"
                    onClick={() => onNavigateTab(item.tab)}
                    className="no-print mt-6 inline-flex items-center justify-between rounded-md bg-[#0A2E36] px-4 py-2.5 text-xs font-semibold tracking-wide text-white uppercase whitespace-nowrap transition-opacity hover:opacity-90"
                  >
                    <span>{item.cta}</span>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ) : (
                  <div className="mt-6 border-t border-white/25 pt-3 text-xs font-semibold tracking-wide text-white/90 uppercase">
                    Active View
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Auto-generated Operational Insights Panel */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <h3 className="font-editorial-serif text-2xl font-bold text-[#1B1B2F]">
            Auto-Generated Operational Insights
          </h3>
          <p className="mt-1 text-sm italic text-[#6B7280]">
            Computed dynamically from current department and date filters
          </p>
          <div className="mt-5 space-y-4">
            {insights.length === 0 ? (
              <div className="rounded-md border border-[#E5E7EB] p-6 text-sm text-[#6B7280]">
                No records match the active filter range. Broaden your date or department selection to
                generate insights.
              </div>
            ) : (
              insights.map((insight, index) => {
                const isDarkTeal = index % 2 === 0;
                return (
                  <div
                    key={insight.id}
                    className="print-break-inside-avoid rounded-md border border-[#E5E7EB] bg-white p-5"
                  >
                    <div className="flex items-start gap-4">
                      <div
                        style={{ backgroundColor: isDarkTeal ? '#02808F' : '#00A795' }}
                        className="font-tabular mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      >
                        {String(index + 1).padStart(2, '0')}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h4 className="text-base font-bold text-[#1B1B2F]">{insight.title}</h4>
                          <span className="font-tabular text-xs font-semibold tracking-wider text-[#02808F] uppercase">
                            {insight.category} · {insight.severity}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-[#1B1B2F]/85">
                          {insight.summary}
                        </p>
                        <p className="mt-2.5 border-t border-[#E5E7EB] pt-2.5 text-xs font-medium text-[#0A2E36]">
                          Recommended Action: <span className="font-normal text-[#6B7280]">{insight.recommendation}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Executive Department Snapshot Table */}
        <div className="lg:col-span-5">
          <h3 className="font-editorial-serif text-2xl font-bold text-[#1B1B2F]">
            Department Performance Matrix
          </h3>
          <p className="mt-1 text-sm italic text-[#6B7280]">
            Ranked by admission volume across active filter scope
          </p>
          <div className="mt-5 overflow-x-auto rounded-md border border-[#E5E7EB] bg-white">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-[#0A2E36] text-xs font-semibold tracking-wider text-white uppercase">
                  <th className="px-4 py-3">Department</th>
                  <th className="px-3 py-3 text-right">Admits</th>
                  <th className="px-3 py-3 text-right">Avg Wait</th>
                  <th className="px-4 py-3 text-right">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {departmentStats.map((dept) => (
                  <tr key={dept.department} className="hover:bg-[#F8FAFC]">
                    <td className="px-4 py-3 font-medium text-[#1B1B2F]">{dept.department}</td>
                    <td className="font-tabular px-3 py-3 text-right text-[#1B1B2F]">
                      {dept.admissions}
                    </td>
                    <td className="font-tabular px-3 py-3 text-right text-[#6B7280]">
                      {dept.avgWaitMinutes}m
                    </td>
                    <td className="font-tabular px-4 py-3 text-right font-semibold text-[#02808F]">
                      {dept.efficiencyScore}/100
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
