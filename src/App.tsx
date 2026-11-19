import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Database,
  Filter,
  MessageSquare,
  RotateCcw,
} from 'lucide-react';
import type {
  CapacityConfig,
  ChatAction,
  ColumnMapping,
  DashboardTab,
  DataQualityReport,
  FilterState,
} from './types/hospital';
import {
  autoDetectColumnMapping,
  normalizeHospitalRecords,
  parseCsvText,
} from './utils/csvParser';
import {
  buildAiAnalyticsContext,
  computeHospitalAnalytics,
  DEFAULT_CAPACITY_CONFIG,
} from './utils/analyticsEngine';
import { ExecutiveSummaryView } from './components/ExecutiveSummaryView';
import { AdmissionsDemandView } from './components/AdmissionsDemandView';
import { StaffWorkloadView } from './components/StaffWorkloadView';
import { BottlenecksForecastView } from './components/BottlenecksForecastView';
import { ColumnMapperModal } from './components/ColumnMapperModal';
import { AiAnalystDrawer } from './components/AiAnalystDrawer';

const NAV_TABS: { id: DashboardTab; code: string; label: string }[] = [
  { id: 'insights', code: '04', label: 'Insights & Dashboards' },
  { id: 'admissions', code: '01', label: 'Admissions & Demand' },
  { id: 'workload', code: '02', label: 'Staff Workload' },
  { id: 'bottlenecks', code: '03', label: 'Bottlenecks & Forecasting' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<DashboardTab>('insights');
  const [datasetName, setDatasetName] = useState('hospital_admissions.csv');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [config, setConfig] = useState<CapacityConfig>(DEFAULT_CAPACITY_CONFIG);
  const [filters, setFilters] = useState<FilterState>({
    startDate: '',
    endDate: '',
    department: 'ALL',
  });
  const [forecastHorizonDays, setForecastHorizonDays] = useState(14);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isMapperOpen, setIsMapperOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Load attached CSV on startup
  useEffect(() => {
    let cancelled = false;
    async function loadInitialDataset() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const res = await fetch('/data/hospital_admissions.csv');
        if (!res.ok) {
          throw new Error(`Failed to load dataset (HTTP ${res.status})`);
        }
        const text = await res.text();
        if (cancelled) return;
        const parsed = parseCsvText(text);
        const detected = autoDetectColumnMapping(parsed.headers);
        setHeaders(parsed.headers);
        setRawRows(parsed.rawRows);
        setMapping(detected);
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : 'Unable to load hospital CSV dataset.'
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void loadInitialDataset();
    return () => {
      cancelled = true;
    };
  }, []);

  const { records, qualityReport } = useMemo(() => {
    if (!mapping || rawRows.length === 0) {
      const emptyReport: DataQualityReport = {
        totalRawRows: 0,
        validRows: 0,
        skippedRows: 0,
        nullWaitCount: 0,
        nullSatisfactionCount: 0,
        sameDayZeroLosCount: 0,
        anomalyWaitCount: 0,
        unmappedOptionalFields: [],
        issuesSample: [],
      };
      return { records: [], qualityReport: emptyReport };
    }
    return normalizeHospitalRecords(rawRows, mapping);
  }, [rawRows, mapping]);

  // Initialize date bounds once records load
  useEffect(() => {
    if (records.length === 0) return;
    const dates = records.map((r) => r.arrivalDate).sort();
    const min = dates[0];
    const max = dates[dates.length - 1];
    setFilters((prev) => ({
      startDate: prev.startDate || min,
      endDate: prev.endDate || max,
      department: prev.department || 'ALL',
    }));
  }, [records]);

  const summary = useMemo(() => {
    return computeHospitalAnalytics(records, filters, config, forecastHorizonDays);
  }, [records, filters, config, forecastHorizonDays]);

  const aiContextJson = useMemo(() => {
    return buildAiAnalyticsContext(
      summary,
      filters,
      config,
      records.length,
      forecastHorizonDays
    );
  }, [summary, filters, config, records.length, forecastHorizonDays]);

  const handleUploadCsvFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsvText(text);
    if (parsed.headers.length === 0 || parsed.rawRows.length === 0) {
      throw new Error('Uploaded CSV contains no header or data rows.');
    }
    const detected = autoDetectColumnMapping(parsed.headers);
    setDatasetName(file.name);
    setHeaders(parsed.headers);
    setRawRows(parsed.rawRows);
    setMapping(detected);
    setFilters({ startDate: '', endDate: '', department: 'ALL' });
    if (!detected.department || !detected.arrivalDate) {
      setIsMapperOpen(true);
    }
  };

  const handleResetFilters = () => {
    setFilters({
      startDate: summary.minDate,
      endDate: summary.maxDate,
      department: 'ALL',
    });
  };

  const handleExportSummaryCsv = () => {
    const header =
      'Department,Admissions,Share_Pct,Avg_Wait_Min,Avg_Service_Min,Avg_LOS_Days,Clinicians,Patient_Staff_Ratio,Est_Overtime_Hours,Est_Overtime_Cost_NGN,CSAT,Readmission_Pct,Efficiency_Score';
    const lines = summary.departmentStats.map((d) =>
      [
        `"${d.department}"`,
        d.admissions,
        d.sharePct,
        d.avgWaitMinutes,
        d.avgServiceMinutes,
        d.avgLosDays,
        d.activeClinicians,
        d.patientToStaffRatio,
        d.estimatedOvertimeHours,
        d.estimatedOvertimeCostNgn,
        d.avgSatisfaction,
        d.readmissionRatePct,
        d.efficiencyScore,
      ].join(',')
    );
    const csvContent = [header, ...lines].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `medpulse_ops_summary_${filters.department.toLowerCase()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleAiAction = (action: ChatAction): string | undefined => {
    if (action.type === 'set_forecast') {
      const days = Math.min(30, Math.max(7, Number(action.horizonDays) || 14));
      setForecastHorizonDays(days);
      setActiveTab('bottlenecks');
      return `Generated ${days}-day forecast in Bottlenecks & Forecasting`;
    }
    if (action.type === 'filter_department' && action.department) {
      const matched =
        action.department === 'ALL'
          ? 'ALL'
          : summary.availableDepartments.find(
              (d) => d.toLowerCase() === action.department!.toLowerCase()
            );
      if (matched) {
        setFilters((prev) => ({ ...prev, department: matched }));
        if (action.targetTab) setActiveTab(action.targetTab);
        return `Filtered dashboard to ${matched === 'ALL' ? 'All Departments' : matched}`;
      }
    }
    if (action.type === 'switch_tab' && action.targetTab) {
      setActiveTab(action.targetTab);
      return `Switched view to ${action.targetTab}`;
    }
    if (action.targetTab) {
      setActiveTab(action.targetTab);
      return `Navigated to ${action.targetTab}`;
    }
    return undefined;
  };

  return (
    <div className={`min-h-screen bg-white text-[#1B1B2F] transition-[padding] duration-200 ${isChatOpen ? 'xl:pr-[448px]' : ''}`}>
      {/* Top Navigation Shell */}
      <header className="no-print sticky top-0 z-30 border-b border-[#E5E7EB] bg-white/95 backdrop-blur-xs">
        <div
          className={`mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8 ${
            isChatOpen ? '2xl:flex-nowrap' : 'lg:flex-nowrap'
          }`}
        >
          {/* Zone 1: Brand Lockup */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0A2E36] text-white">
              <Activity className="h-4 w-4 text-[#00A795]" />
            </div>
            <div>
              <h1 className="font-editorial-serif text-base font-bold leading-none text-[#1B1B2F]">
                MedPulse Ops
              </h1>
              <p className="mt-1 text-[10px] font-medium tracking-wider text-[#6B7280] uppercase">
                Hospital Operations Analytics · Fictional Data Demo
              </p>
            </div>
          </div>

          {/* Zone 2: Section Tabs */}
          <nav aria-label="Dashboard sections" className="flex items-center gap-1 overflow-x-auto py-0.5">
            {NAV_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                    isActive
                      ? 'bg-[#02808F] text-white'
                      : 'text-[#1B1B2F] hover:bg-[#F3F4F6]'
                  }`}
                >
                  <span
                    className={`font-tabular text-[11px] ${
                      isActive ? 'text-white/85' : 'text-[#00A795]'
                    }`}
                  >
                    {tab.code}
                  </span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Schema & AI Analyst Utilities */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsMapperOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-semibold text-[#1B1B2F] whitespace-nowrap shrink-0 transition-colors hover:border-[#02808F] hover:text-[#02808F]"
            >
              <Database className="h-3.5 w-3.5 text-[#02808F]" />
              <span>Data & Schema</span>
            </button>
            <button
              type="button"
              onClick={() => setIsChatOpen((v) => !v)}
              aria-expanded={isChatOpen}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#0A2E36] px-3 py-1.5 text-xs font-semibold text-white whitespace-nowrap shrink-0 transition-colors hover:bg-[#02808F]"
            >
              <MessageSquare className="h-3.5 w-3.5 text-[#00A795]" />
              <span>Offline Analytics Guide</span>
            </button>
          </div>
        </div>

        {/* Global Cross-Section Filter Bar */}
        <div className="border-t border-[#E5E7EB] bg-[#F8FAFC]">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-4 py-2.5 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0A2E36]">
                <Filter className="h-3.5 w-3.5 text-[#02808F]" />
                <span>Scope:</span>
              </div>

              <div className="flex items-center gap-1.5">
                <label htmlFor="filter-department" className="text-xs text-[#6B7280]">
                  Department
                </label>
                <select
                  id="filter-department"
                  value={filters.department}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, department: e.target.value }))
                  }
                  className="rounded border border-[#E5E7EB] bg-white px-2.5 py-1 text-xs font-medium text-[#1B1B2F]"
                >
                  <option value="ALL">All Departments ({summary.availableDepartments.length})</option>
                  {summary.availableDepartments.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <label htmlFor="filter-start-date" className="text-xs text-[#6B7280]">
                  From
                </label>
                <input
                  id="filter-start-date"
                  type="date"
                  value={filters.startDate}
                  min={summary.minDate}
                  max={filters.endDate || summary.maxDate}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, startDate: e.target.value }))
                  }
                  className="font-tabular rounded border border-[#E5E7EB] bg-white px-2 py-1 text-xs text-[#1B1B2F]"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <label htmlFor="filter-end-date" className="text-xs text-[#6B7280]">
                  To
                </label>
                <input
                  id="filter-end-date"
                  type="date"
                  value={filters.endDate}
                  min={filters.startDate || summary.minDate}
                  max={summary.maxDate}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, endDate: e.target.value }))
                  }
                  className="font-tabular rounded border border-[#E5E7EB] bg-white px-2 py-1 text-xs text-[#1B1B2F]"
                />
              </div>

              {(filters.department !== 'ALL' ||
                (summary.minDate && filters.startDate !== summary.minDate) ||
                (summary.maxDate && filters.endDate !== summary.maxDate)) && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-[#02808F] hover:bg-white"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset</span>
                </button>
              )}
            </div>

            <div className="font-tabular text-[11px] text-[#6B7280]">
              {records.length > 0
                ? `${summary.kpis.totalAdmissions.toLocaleString()} of ${records.length.toLocaleString()} records active · ${config.totalLicensedBeds}-bed model`
                : 'Loading dataset...'}
              {qualityReport.skippedRows > 0
                ? ` · ${qualityReport.skippedRows} malformed rows skipped`
                : ''}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:px-8">
        {isLoading ? (
          <div className="space-y-6" aria-busy="true">
            <div className="h-16 w-2/3 animate-pulse rounded-md bg-[#F3F4F6]" />
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  style={{ backgroundColor: idx % 2 === 0 ? '#02808F' : '#00A795' }}
                  className="h-44 animate-pulse rounded-md opacity-70"
                />
              ))}
            </div>
            <div className="h-80 animate-pulse rounded-md bg-[#F3F4F6]" />
          </div>
        ) : loadError ? (
          <div className="rounded-md border border-[#02808F] bg-[#0A2E36] p-8 text-white">
            <h2 className="font-editorial-serif text-2xl font-bold">
              Unable to Load Hospital Dataset
            </h2>
            <p className="mt-2 text-sm text-white/85">{loadError}</p>
            <button
              type="button"
              onClick={() => setIsMapperOpen(true)}
              className="mt-4 rounded-md bg-[#00A795] px-4 py-2 text-xs font-semibold text-white"
            >
              Upload CSV Manually
            </button>
          </div>
        ) : (
          <>
            {activeTab === 'insights' && (
              <ExecutiveSummaryView
                summary={summary}
                config={config}
                forecastHorizonDays={forecastHorizonDays}
                onNavigateTab={setActiveTab}
                onExportSummaryCsv={handleExportSummaryCsv}
              />
            )}
            {activeTab === 'admissions' && <AdmissionsDemandView summary={summary} />}
            {activeTab === 'workload' && (
              <StaffWorkloadView summary={summary} config={config} />
            )}
            {activeTab === 'bottlenecks' && (
              <BottlenecksForecastView
                summary={summary}
                config={config}
                forecastHorizonDays={forecastHorizonDays}
                onChangeForecastHorizon={setForecastHorizonDays}
              />
            )}
          </>
        )}
      </main>

      {/* Column Mapping, CSV Upload & Capacity Settings Modal */}
      {mapping ? (
        <ColumnMapperModal
          isOpen={isMapperOpen}
          onClose={() => setIsMapperOpen(false)}
          headers={headers}
          mapping={mapping}
          config={config}
          qualityReport={qualityReport}
          datasetName={datasetName}
          onApplyMappingAndConfig={(nextMap, nextCfg) => {
            setMapping(nextMap);
            setConfig(nextCfg);
          }}
          onUploadCsvFile={handleUploadCsvFile}
        />
      ) : null}

      {/* Persistent Collapsible AI Operations Analyst Drawer */}
      <AiAnalystDrawer
        isOpen={isChatOpen}
        onToggleOpen={() => setIsChatOpen((v) => !v)}
        analyticsContextJson={aiContextJson}
        totalRows={summary.kpis.totalAdmissions || records.length}
        dateSpanLabel={summary.kpis.dateSpanLabel}
        onExecuteAction={handleAiAction}
      />
    </div>
  );
}
