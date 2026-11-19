import Papa from 'papaparse';
import type {
  ColumnMapping,
  DataQualityIssue,
  DataQualityReport,
  HospitalRecord,
  ShiftName,
} from '../types/hospital';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const FIELD_SYNONYMS: Record<keyof ColumnMapping, string[]> = {
  patientId: ['patientid', 'patient_id', 'recordid', 'admissionid', 'id', 'mrn'],
  patientName: ['patientname', 'patient_name', 'name', 'fullname'],
  department: ['department', 'dept', 'unit', 'ward', 'service'],
  physician: ['attendingphysician', 'physician', 'doctor', 'clinician', 'provider', 'staffname'],
  arrivalDate: ['arrivaldate', 'arrival_date', 'admissiondate', 'admission_date', 'date', 'visitdate'],
  arrivalTime: ['arrivaltime', 'arrival_time', 'admissiontime', 'time', 'checkintime'],
  waitTime: ['waittime_minutes', 'waittime', 'wait_time', 'wait_minutes', 'waitingtime'],
  serviceDuration: ['serviceduration_minutes', 'serviceduration', 'service_duration', 'duration_minutes', 'consulttime'],
  dischargeDate: ['dischargedate', 'discharge_date', 'releasedate', 'checkoutdate'],
  lengthOfStay: ['lengthofstay_days', 'lengthofstay', 'los', 'los_days', 'staydays'],
  treatmentCost: ['treatmentcost_ngn', 'treatmentcost', 'cost', 'billingamount', 'charge'],
  satisfactionScore: ['patientsatisfactionscore', 'satisfactionscore', 'satisfaction', 'csat', 'rating'],
  readmitted: ['readmittedwithin30days', 'readmitted', 'readmission', 'readmit_30d'],
  dischargeStatus: ['dischargestatus', 'discharge_status', 'status', 'outcome'],
  diagnosis: ['diagnosiscategory', 'diagnosis', 'condition', 'primarydiagnosis'],
  staffCount: ['staffcount', 'staff_count', 'clinicians', 'nurses', 'staffing'],
  bedOccupancyPct: ['bedoccupancypct', 'bed_occupancy_pct', 'occupancy_pct', 'bedoccupancy', 'occupancy'],
  overtimeHours: ['overtimehours', 'overtime_hours', 'overtime', 'ot_hours'],
};

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function autoDetectColumnMapping(headers: string[]): ColumnMapping {
  const normalizedMap = new Map<string, string>();
  headers.forEach((h) => {
    normalizedMap.set(normalizeHeader(h), h);
  });

  const findMatch = (field: keyof ColumnMapping): string => {
    const candidates = FIELD_SYNONYMS[field];
    // Exact normalized match first
    for (const candidate of candidates) {
      const clean = normalizeHeader(candidate);
      if (normalizedMap.has(clean)) {
        return normalizedMap.get(clean)!;
      }
    }
    // Partial contains match
    for (const candidate of candidates) {
      const clean = normalizeHeader(candidate);
      for (const [normHeader, original] of normalizedMap.entries()) {
        if (normHeader.includes(clean) || clean.includes(normHeader)) {
          return original;
        }
      }
    }
    return '';
  };

  return {
    patientId: findMatch('patientId'),
    patientName: findMatch('patientName'),
    department: findMatch('department'),
    physician: findMatch('physician'),
    arrivalDate: findMatch('arrivalDate'),
    arrivalTime: findMatch('arrivalTime'),
    waitTime: findMatch('waitTime'),
    serviceDuration: findMatch('serviceDuration'),
    dischargeDate: findMatch('dischargeDate'),
    lengthOfStay: findMatch('lengthOfStay'),
    treatmentCost: findMatch('treatmentCost'),
    satisfactionScore: findMatch('satisfactionScore'),
    readmitted: findMatch('readmitted'),
    dischargeStatus: findMatch('dischargeStatus'),
    diagnosis: findMatch('diagnosis'),
    staffCount: findMatch('staffCount') || undefined,
    bedOccupancyPct: findMatch('bedOccupancyPct') || undefined,
    overtimeHours: findMatch('overtimeHours') || undefined,
  };
}

export function parseCsvText(csvText: string): {
  headers: string[];
  rawRows: Record<string, string>[];
} {
  const result = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const headers = result.meta.fields ?? [];
  return {
    headers,
    rawRows: result.data,
  };
}

function parseIsoDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // YYYY-MM-DD
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(trimmed);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // Fallback Date.parse for MM/DD/YYYY etc.
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getUTCFullYear();
    const m = parsed.getUTCMonth() + 1;
    const d = parsed.getUTCDate();
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  return null;
}

function parseTimeHour(raw: string | undefined): { formatted: string; hour: number } {
  if (!raw) return { formatted: '09:00', hour: 9 };
  const trimmed = raw.trim();
  const match = /^(\d{1,2}):(\d{2})/.exec(trimmed);
  if (!match) return { formatted: '09:00', hour: 9 };
  const h = Math.min(23, Math.max(0, Number(match[1])));
  const m = Math.min(59, Math.max(0, Number(match[2])));
  return {
    formatted: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    hour: h,
  };
}

function parseNumber(raw: string | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  const cleaned = String(raw).replace(/[,$\s₦]/g, '').trim();
  if (!cleaned) return null;
  const val = Number(cleaned);
  return Number.isFinite(val) ? val : null;
}

function getMondayBasedDayIndex(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const jsDay = dt.getUTCDay(); // 0=Sun .. 6=Sat
  return (jsDay + 6) % 7; // 0=Mon .. 6=Sun
}

export function deriveShift(hour: number): ShiftName {
  if (hour >= 7 && hour < 14) return 'Morning';
  if (hour >= 14 && hour < 21) return 'Afternoon';
  return 'Night';
}

export function normalizeHospitalRecords(
  rawRows: Record<string, string>[],
  mapping: ColumnMapping
): {
  records: HospitalRecord[];
  qualityReport: DataQualityReport;
} {
  const records: HospitalRecord[] = [];
  const issuesSample: DataQualityIssue[] = [];
  let skippedRows = 0;
  let nullWaitCount = 0;
  let nullSatisfactionCount = 0;
  let sameDayZeroLosCount = 0;
  let anomalyWaitCount = 0;

  const pushIssue = (issue: DataQualityIssue) => {
    if (issuesSample.length < 40) {
      issuesSample.push(issue);
    }
  };

  rawRows.forEach((row, idx) => {
    const rowNum = idx + 2; // 1-indexed + header
    const rawId = mapping.patientId ? (row[mapping.patientId] ?? '').trim() : '';
    const patientId = rawId || `ROW-${rowNum}`;
    const rawDept = mapping.department ? (row[mapping.department] ?? '').trim() : '';
    const rawDate = mapping.arrivalDate ? row[mapping.arrivalDate] : '';

    const arrivalDate = parseIsoDate(rawDate);
    if (!arrivalDate || !rawDept) {
      skippedRows++;
      pushIssue({
        rowNumber: rowNum,
        patientId,
        type: !arrivalDate ? 'invalid_date' : 'missing_required',
        message: !arrivalDate
          ? `Invalid or missing arrival date "${rawDate ?? ''}"`
          : 'Missing department assignment',
      });
      return;
    }

    const { formatted: arrivalTime, hour: arrivalHour } = parseTimeHour(
      mapping.arrivalTime ? row[mapping.arrivalTime] : undefined
    );
    const dayOfWeekIndex = getMondayBasedDayIndex(arrivalDate);

    let waitTime = parseNumber(mapping.waitTime ? row[mapping.waitTime] : undefined);
    if (waitTime === null) {
      nullWaitCount++;
    } else if (waitTime < 0) {
      anomalyWaitCount++;
      pushIssue({
        rowNumber: rowNum,
        patientId,
        type: 'negative_metric',
        message: `Negative wait time (${waitTime}m) clamped to null`,
      });
      waitTime = null;
    } else if (waitTime > 240) {
      anomalyWaitCount++;
      pushIssue({
        rowNumber: rowNum,
        patientId,
        type: 'anomaly_wait',
        message: `Extended wait outlier (${waitTime}m) recorded`,
      });
    }

    let serviceDuration = parseNumber(
      mapping.serviceDuration ? row[mapping.serviceDuration] : undefined
    );
    if (serviceDuration !== null && serviceDuration < 0) {
      serviceDuration = null;
    }

    const dischargeDate = parseIsoDate(
      mapping.dischargeDate ? row[mapping.dischargeDate] : undefined
    );
    let lengthOfStay = parseNumber(mapping.lengthOfStay ? row[mapping.lengthOfStay] : undefined);
    if (lengthOfStay === 0) {
      sameDayZeroLosCount++;
    } else if (lengthOfStay !== null && lengthOfStay < 0) {
      lengthOfStay = 0;
    }

    const satisfaction = parseNumber(
      mapping.satisfactionScore ? row[mapping.satisfactionScore] : undefined
    );
    if (satisfaction === null) {
      nullSatisfactionCount++;
    }

    const readmitRaw = (mapping.readmitted ? row[mapping.readmitted] ?? '' : '').trim().toLowerCase();
    const readmittedWithin30Days =
      readmitRaw === 'yes' || readmitRaw === 'true' || readmitRaw === '1' || readmitRaw === 'y';

    const ageVal = parseNumber(row['Age'] ?? row['age']);

    records.push({
      id: patientId,
      patientName: (mapping.patientName ? row[mapping.patientName] : '')?.trim() || patientId,
      age: ageVal,
      gender: (row['Gender'] ?? row['gender'] ?? 'Unknown').trim() || 'Unknown',
      department: rawDept,
      physician: (mapping.physician ? row[mapping.physician] : '')?.trim() || 'Unassigned',
      arrivalDate,
      arrivalTime,
      arrivalHour,
      dayOfWeekIndex,
      dayOfWeekLabel: DAY_LABELS[dayOfWeekIndex],
      shift: deriveShift(arrivalHour),
      waitTimeMinutes: waitTime,
      serviceDurationMinutes: serviceDuration,
      dischargeDate,
      lengthOfStayDays: lengthOfStay,
      diagnosisCategory: (mapping.diagnosis ? row[mapping.diagnosis] : '')?.trim() || 'General',
      insuranceType: (row['InsuranceType'] ?? row['Insurance'] ?? 'Unspecified').trim(),
      treatmentCostNgn: parseNumber(mapping.treatmentCost ? row[mapping.treatmentCost] : undefined),
      readmittedWithin30Days,
      satisfactionScore: satisfaction,
      dischargeStatus: (mapping.dischargeStatus ? row[mapping.dischargeStatus] : '')?.trim() || 'Recorded',
      directStaffCount: parseNumber(mapping.staffCount ? row[mapping.staffCount] : undefined),
      directBedOccupancyPct: parseNumber(mapping.bedOccupancyPct ? row[mapping.bedOccupancyPct] : undefined),
      directOvertimeHours: parseNumber(mapping.overtimeHours ? row[mapping.overtimeHours] : undefined),
    });
  });

  const unmappedOptionalFields: string[] = [];
  if (!mapping.staffCount) unmappedOptionalFields.push('Direct Staff Count (derived from distinct clinicians)');
  if (!mapping.bedOccupancyPct) unmappedOptionalFields.push('Direct Bed Occupancy % (derived from daily inpatient census)');
  if (!mapping.overtimeHours) unmappedOptionalFields.push('Direct Overtime Hours (derived from workload vs shift capacity)');

  return {
    records,
    qualityReport: {
      totalRawRows: rawRows.length,
      validRows: records.length,
      skippedRows,
      nullWaitCount,
      nullSatisfactionCount,
      sameDayZeroLosCount,
      anomalyWaitCount,
      unmappedOptionalFields,
      issuesSample,
    },
  };
}
