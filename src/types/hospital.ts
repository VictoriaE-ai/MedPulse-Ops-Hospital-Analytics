export type DashboardTab = 'insights' | 'admissions' | 'workload' | 'bottlenecks';

export type ShiftName = 'Morning' | 'Afternoon' | 'Night';

export interface ColumnMapping {
  patientId: string;
  patientName: string;
  department: string;
  physician: string;
  arrivalDate: string;
  arrivalTime: string;
  waitTime: string;
  serviceDuration: string;
  dischargeDate: string;
  lengthOfStay: string;
  treatmentCost: string;
  satisfactionScore: string;
  readmitted: string;
  dischargeStatus: string;
  diagnosis: string;
  // Optional direct operational columns if a custom CSV supplies them
  staffCount?: string;
  bedOccupancyPct?: string;
  overtimeHours?: string;
}

export interface DataQualityIssue {
  rowNumber: number;
  patientId: string;
  type: 'missing_required' | 'invalid_date' | 'negative_metric' | 'anomaly_wait' | 'zero_los_same_day';
  message: string;
}

export interface DataQualityReport {
  totalRawRows: number;
  validRows: number;
  skippedRows: number;
  nullWaitCount: number;
  nullSatisfactionCount: number;
  sameDayZeroLosCount: number;
  anomalyWaitCount: number;
  unmappedOptionalFields: string[];
  issuesSample: DataQualityIssue[];
}

export interface HospitalRecord {
  id: string;
  patientName: string;
  age: number | null;
  gender: string;
  department: string;
  physician: string;
  arrivalDate: string; // YYYY-MM-DD
  arrivalTime: string; // HH:mm
  arrivalHour: number; // 0-23
  dayOfWeekIndex: number; // 0=Mon .. 6=Sun
  dayOfWeekLabel: string; // Mon .. Sun
  shift: ShiftName;
  waitTimeMinutes: number | null;
  serviceDurationMinutes: number | null;
  dischargeDate: string | null;
  lengthOfStayDays: number | null;
  diagnosisCategory: string;
  insuranceType: string;
  treatmentCostNgn: number | null;
  readmittedWithin30Days: boolean;
  satisfactionScore: number | null;
  dischargeStatus: string;
  directStaffCount: number | null;
  directBedOccupancyPct: number | null;
  directOvertimeHours: number | null;
}

export interface CapacityConfig {
  totalLicensedBeds: number;
  shiftDurationHours: number;
  targetPatientsPerClinician: number;
  overtimeRateNgnPerHour: number;
  occupancyWarningPct: number;
  occupancyCriticalPct: number;
}

export interface FilterState {
  startDate: string;
  endDate: string;
  department: string; // 'ALL' or department name
}

export interface DailySeriesPoint {
  date: string;
  label: string;
  admissions: number;
  avgWaitMinutes: number;
  avgServiceMinutes: number;
  activeClinicians: number;
  patientToStaffRatio: number;
  overtimeHours: number;
  overtimeCostNgn: number;
  bedCensus: number;
  bedOccupancyPct: number;
  isOccupancySpike: boolean;
  spikeSeverity: 'normal' | 'warning' | 'critical';
  staffingTarget: number;
  staffingGap: number;
}

export interface HeatmapCell {
  dayIndex: number; // 0=Mon .. 6=Sun
  dayLabel: string;
  hour: number; // 0..23
  count: number;
  avgWaitMinutes: number;
}

export interface DepartmentStat {
  department: string;
  admissions: number;
  sharePct: number;
  avgWaitMinutes: number;
  avgServiceMinutes: number;
  avgLosDays: number;
  avgSatisfaction: number;
  readmissionRatePct: number;
  activeClinicians: number;
  patientToStaffRatio: number;
  estimatedOvertimeHours: number;
  estimatedOvertimeCostNgn: number;
  totalRevenueNgn: number;
  efficiencyScore: number; // 0-100 composite
}

export interface ShiftWorkloadStat {
  department: string;
  shift: ShiftName;
  admissions: number;
  avgCliniciansPerDay: number;
  patientToStaffRatio: number;
  overtimeHours: number;
  understaffedDays: number;
}

export interface BottleneckAlert {
  id: string;
  date: string;
  shift: ShiftName;
  department: string;
  alertType: 'bed_spike' | 'understaffed_shift' | 'wait_surge';
  severity: 'warning' | 'critical';
  metricLabel: string;
  metricValue: string;
  thresholdValue: string;
  recommendedAction: string;
}

export interface ForecastPoint {
  date: string;
  label: string;
  isForecast: boolean;
  actualAdmissions: number | null;
  predictedAdmissions: number | null;
  admissionsLower: number | null;
  admissionsUpper: number | null;
  actualOccupancyPct: number | null;
  predictedOccupancyPct: number | null;
  occupancyLowerPct: number | null;
  occupancyUpperPct: number | null;
  actualStaffCount: number | null;
  predictedStaffNeeded: number | null;
  staffLower: number | null;
  staffUpper: number | null;
}

export interface ExecutiveKPIs {
  totalAdmissions: number;
  avgWaitMinutes: number;
  avgBedOccupancyPct: number;
  peakBedOccupancyPct: number;
  occupancySpikeDays: number;
  estimatedOvertimeHours: number;
  estimatedOvertimeCostNgn: number;
  avgPatientToStaffRatio: number;
  avgSatisfaction: number;
  readmissionRatePct: number;
  understaffedAlertCount: number;
  dateSpanLabel: string;
}

export interface NarrativeInsight {
  id: string;
  category: 'demand' | 'workload' | 'bottleneck' | 'efficiency';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  summary: string;
  recommendation: string;
}

export interface AnalyticsSummary {
  kpis: ExecutiveKPIs;
  dailySeries: DailySeriesPoint[];
  heatmap: HeatmapCell[];
  departmentStats: DepartmentStat[];
  shiftWorkloads: ShiftWorkloadStat[];
  bottleneckAlerts: BottleneckAlert[];
  forecasts: ForecastPoint[];
  insights: NarrativeInsight[];
  availableDepartments: string[];
  minDate: string;
  maxDate: string;
  usedDirectStaffColumn: boolean;
  usedDirectOccupancyColumn: boolean;
  usedDirectOvertimeColumn: boolean;
}

export interface ChatAction {
  type: 'none' | 'set_forecast' | 'filter_department' | 'switch_tab';
  horizonDays?: number;
  department?: string;
  targetTab?: DashboardTab;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: string[];
  actionApplied?: string;
  isError?: boolean;
  timestamp: string;
}
