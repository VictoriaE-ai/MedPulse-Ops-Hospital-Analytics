import type {
  AnalyticsSummary,
  BottleneckAlert,
  CapacityConfig,
  DailySeriesPoint,
  DepartmentStat,
  FilterState,
  ForecastPoint,
  HeatmapCell,
  HospitalRecord,
  NarrativeInsight,
  ShiftName,
  ShiftWorkloadStat,
} from '../types/hospital';

export const DEFAULT_CAPACITY_CONFIG: CapacityConfig = {
  totalLicensedBeds: 16,
  shiftDurationHours: 8,
  targetPatientsPerClinician: 4.5,
  overtimeRateNgnPerHour: 12500,
  occupancyWarningPct: 85,
  occupancyCriticalPct: 95,
};

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const SHIFTS: ShiftName[] = ['Morning', 'Afternoon', 'Night'];

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatShortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function enumerateDateRange(startIso: string, endIso: string): string[] {
  const dates: string[] = [];
  let cur = startIso;
  let guard = 0;
  while (cur <= endIso && guard < 1500) {
    dates.push(cur);
    cur = addDaysIso(cur, 1);
    guard++;
  }
  return dates;
}

/**
 * Computes explainable linear + day-of-week seasonal forecast with 90% prediction bands.
 */
export function buildForecastSeries(
  dailySeries: DailySeriesPoint[],
  horizonDays: number,
  config: CapacityConfig
): ForecastPoint[] {
  const clampedHorizon = Math.min(30, Math.max(7, Math.round(horizonDays)));
  if (dailySeries.length === 0) return [];

  // Show recent 30 days of historical actuals + N forecast days
  const historyWindow = dailySeries.slice(-30);
  const trainWindow = dailySeries.slice(-Math.min(60, dailySeries.length));
  const n = trainWindow.length;

  const linearFit = (values: number[]) => {
    const len = values.length;
    if (len <= 1) {
      const v = values[0] ?? 0;
      return { slope: 0, intercept: v, stdErr: Math.max(0.5, v * 0.15) };
    }
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    for (let i = 0; i < len; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumXX += i * i;
    }
    const denom = len * sumXX - sumX * sumX;
    const slope = denom === 0 ? 0 : (len * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / len;

    // Residual std error
    let sqErr = 0;
    for (let i = 0; i < len; i++) {
      const pred = intercept + slope * i;
      const err = values[i] - pred;
      sqErr += err * err;
    }
    const stdErr = Math.sqrt(sqErr / Math.max(1, len - 2));
    return { slope, intercept, stdErr };
  };

  // Compute day-of-week seasonal multipliers from training window
  const computeDowFactors = (values: number[]) => {
    const sums = Array(7).fill(0);
    const counts = Array(7).fill(0);
    const overallAvg = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
    trainWindow.forEach((pt, idx) => {
      const [y, m, d] = pt.date.split('-').map(Number);
      const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      sums[dow] += values[idx];
      counts[dow] += 1;
    });
    return sums.map((s, dow) => {
      if (counts[dow] === 0 || overallAvg === 0) return 1;
      const rawFactor = s / counts[dow] / overallAvg;
      // Dampen extremes so small samples don't swing wildly
      return 0.65 + 0.35 * Math.min(1.6, Math.max(0.5, rawFactor));
    });
  };

  const admVals = trainWindow.map((d) => d.admissions);
  const occVals = trainWindow.map((d) => d.bedOccupancyPct);

  const admFit = linearFit(admVals);
  const occFit = linearFit(occVals);
  const admDow = computeDowFactors(admVals);
  const occDow = computeDowFactors(occVals);

  const points: ForecastPoint[] = historyWindow.map((pt) => ({
    date: pt.date,
    label: pt.label,
    isForecast: false,
    actualAdmissions: pt.admissions,
    predictedAdmissions: null,
    admissionsLower: null,
    admissionsUpper: null,
    actualOccupancyPct: pt.bedOccupancyPct,
    predictedOccupancyPct: null,
    occupancyLowerPct: null,
    occupancyUpperPct: null,
    actualStaffCount: pt.activeClinicians,
    predictedStaffNeeded: null,
    staffLower: null,
    staffUpper: null,
  }));

  const lastDate = dailySeries[dailySeries.length - 1].date;
  const avgCensusToAdmissions =
    trainWindow.reduce((s, d) => s + d.bedCensus, 0) /
    Math.max(
      1,
      trainWindow.reduce((s, d) => s + d.admissions, 0)
    );

  for (let h = 1; h <= clampedHorizon; h++) {
    const fDate = addDaysIso(lastDate, h);
    const [y, m, d] = fDate.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const x = n - 1 + h;

    const horizonSpread = 1 + (h / clampedHorizon) * 0.45;

    const rawAdm = Math.max(0, (admFit.intercept + admFit.slope * x) * admDow[dow]);
    const admMargin = Math.max(0.8, 1.64 * admFit.stdErr * horizonSpread);
    const predAdm = round1(rawAdm);
    const admLower = round1(Math.max(0, predAdm - admMargin));
    const admUpper = round1(predAdm + admMargin);

    const rawOcc = Math.max(5, Math.min(140, (occFit.intercept + occFit.slope * x) * occDow[dow]));
    const occMargin = Math.max(5, 1.64 * occFit.stdErr * horizonSpread);
    const predOcc = round1(rawOcc);
    const occLower = round1(Math.max(0, predOcc - occMargin));
    const occUpper = round1(Math.min(150, predOcc + occMargin));

    // Projected staffing needed based on predicted active load (inpatient census + intake)
    const impliedBeds = (predOcc / 100) * config.totalLicensedBeds;
    const estActiveLoad = Math.max(predAdm, impliedBeds + predAdm * 0.35);
    const predStaff = Math.max(
      1,
      round1(
        (estActiveLoad > 0 ? estActiveLoad : predAdm * Math.max(1, avgCensusToAdmissions)) /
          Math.max(1, config.targetPatientsPerClinician)
      )
    );
    const staffMargin = Math.max(1, round1(predStaff * 0.22 * horizonSpread));

    points.push({
      date: fDate,
      label: formatShortDate(fDate),
      isForecast: true,
      actualAdmissions: null,
      predictedAdmissions: predAdm,
      admissionsLower: admLower,
      admissionsUpper: admUpper,
      actualOccupancyPct: null,
      predictedOccupancyPct: predOcc,
      occupancyLowerPct: occLower,
      occupancyUpperPct: occUpper,
      actualStaffCount: null,
      predictedStaffNeeded: predStaff,
      staffLower: Math.max(1, round1(predStaff - staffMargin)),
      staffUpper: round1(predStaff + staffMargin),
    });
  }

  return points;
}

export function computeHospitalAnalytics(
  allRecords: HospitalRecord[],
  filters: FilterState,
  config: CapacityConfig,
  forecastHorizonDays = 14
): AnalyticsSummary {
  const availableDepartments = Array.from(new Set(allRecords.map((r) => r.department))).sort();
  const allDatesSorted = allRecords.map((r) => r.arrivalDate).sort();
  const minDate = allDatesSorted[0] ?? '2025-01-01';
  const maxDate = allDatesSorted[allDatesSorted.length - 1] ?? '2025-12-31';

  const startBound = filters.startDate || minDate;
  const endBound = filters.endDate || maxDate;

  const filteredRecords = allRecords.filter((r) => {
    if (r.arrivalDate < startBound || r.arrivalDate > endBound) return false;
    if (filters.department !== 'ALL' && r.department !== filters.department) return false;
    return true;
  });

  // Determine bed allocation when filtering to a single department
  const totalCountAll = Math.max(1, allRecords.length);
  const deptRecordsInWindow = allRecords.filter(
    (r) =>
      r.arrivalDate >= startBound &&
      r.arrivalDate <= endBound &&
      (filters.department === 'ALL' || r.department === filters.department)
  );
  const windowAllCount = Math.max(
    1,
    allRecords.filter((r) => r.arrivalDate >= startBound && r.arrivalDate <= endBound).length
  );
  const deptBedShare =
    filters.department === 'ALL' ? 1 : Math.max(0.12, deptRecordsInWindow.length / windowAllCount);
  const effectiveBeds =
    filters.department === 'ALL'
      ? Math.max(1, config.totalLicensedBeds)
      : Math.max(2, Math.round(config.totalLicensedBeds * deptBedShare));

  // Build daily census map across active range (using all filtered records including carryovers)
  const dateDomain =
    filteredRecords.length > 0 ? enumerateDateRange(startBound, endBound) : [];

  const dailyRecordsMap = new Map<string, HospitalRecord[]>();
  const dailyCensusMap = new Map<string, number>();
  for (const d of dateDomain) {
    dailyRecordsMap.set(d, []);
    dailyCensusMap.set(d, 0);
  }

  // Carryover inpatient census from all records matching department filter
  const deptAllTimeRecords =
    filters.department === 'ALL'
      ? allRecords
      : allRecords.filter((r) => r.department === filters.department);

  for (const r of deptAllTimeRecords) {
    if (r.arrivalDate > endBound) continue;
    const los = r.lengthOfStayDays ?? 1;
    if (los === 0) {
      if (dailyCensusMap.has(r.arrivalDate)) {
        dailyCensusMap.set(r.arrivalDate, (dailyCensusMap.get(r.arrivalDate) ?? 0) + 0.5);
      }
      continue;
    }
    const endIso = r.dischargeDate ?? addDaysIso(r.arrivalDate, Math.max(1, Math.round(los)));
    const clampedStart = r.arrivalDate < startBound ? startBound : r.arrivalDate;
    let cur = clampedStart;
    let guard = 0;
    while (cur < endIso && cur <= endBound && guard < 180) {
      if (dailyCensusMap.has(cur)) {
        dailyCensusMap.set(cur, (dailyCensusMap.get(cur) ?? 0) + 1);
      }
      cur = addDaysIso(cur, 1);
      guard++;
    }
  }

  for (const r of filteredRecords) {
    const arr = dailyRecordsMap.get(r.arrivalDate);
    if (arr) arr.push(r);
  }

  let usedDirectStaffColumn = false;
  let usedDirectOccupancyColumn = false;
  let usedDirectOvertimeColumn = false;

  const dailySeries: DailySeriesPoint[] = dateDomain.map((d) => {
    const list = dailyRecordsMap.get(d) ?? [];
    const census = dailyCensusMap.get(d) ?? 0;

    const waits = list
      .map((r) => r.waitTimeMinutes)
      .filter((v): v is number => v !== null);
    const services = list
      .map((r) => r.serviceDurationMinutes)
      .filter((v): v is number => v !== null);

    const avgWait = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : 0;
    const avgService = services.length
      ? services.reduce((a, b) => a + b, 0) / services.length
      : 0;

    // Direct staff if supplied in CSV
    const directStaffVals = list
      .map((r) => r.directStaffCount)
      .filter((v): v is number => v !== null);
    let activeClinicians = 0;
    if (directStaffVals.length > 0) {
      usedDirectStaffColumn = true;
      activeClinicians = Math.max(
        1,
        Math.round(directStaffVals.reduce((a, b) => a + b, 0) / directStaffVals.length)
      );
    } else {
      activeClinicians = new Set(list.map((r) => r.physician)).size;
    }

    // Active load includes inpatient census + new intake load
    const activeLoad = census + list.length * 0.5;
    const patientToStaffRatio =
      activeClinicians > 0 ? round2(activeLoad / activeClinicians) : 0;
    const staffingTarget = Math.max(
      1,
      Math.ceil(activeLoad / Math.max(1, config.targetPatientsPerClinician))
    );
    const staffingGap = Math.max(0, staffingTarget - activeClinicians);

    // Direct occupancy or census-derived
    const directOccVals = list
      .map((r) => r.directBedOccupancyPct)
      .filter((v): v is number => v !== null);
    let bedOccupancyPct = 0;
    if (directOccVals.length > 0) {
      usedDirectOccupancyColumn = true;
      bedOccupancyPct = round1(
        directOccVals.reduce((a, b) => a + b, 0) / directOccVals.length
      );
    } else {
      bedOccupancyPct = round1((census / effectiveBeds) * 100);
    }

    // Direct overtime or workload-derived
    const directOtVals = list
      .map((r) => r.directOvertimeHours)
      .filter((v): v is number => v !== null);
    let overtimeHours = 0;
    if (directOtVals.length > 0) {
      usedDirectOvertimeColumn = true;
      overtimeHours = round2(directOtVals.reduce((a, b) => a + b, 0));
    } else {
      // Excess service + triage surge + night shift call-in + staffing deficit coverage
      let ot = 0;
      for (const r of list) {
        const waitExcess = Math.max(0, (r.waitTimeMinutes ?? 0) - 45) * 0.012;
        const serviceExcess = Math.max(0, (r.serviceDurationMinutes ?? 0) - 55) * 0.018;
        const nightPremium = r.shift === 'Night' ? 0.65 : 0;
        ot += waitExcess + serviceExcess + nightPremium;
      }
      if (staffingGap > 0) {
        ot += staffingGap * 1.75;
      }
      overtimeHours = round2(ot);
    }

    const spikeSeverity: 'normal' | 'warning' | 'critical' =
      bedOccupancyPct >= config.occupancyCriticalPct
        ? 'critical'
        : bedOccupancyPct >= config.occupancyWarningPct
        ? 'warning'
        : 'normal';

    return {
      date: d,
      label: formatShortDate(d),
      admissions: list.length,
      avgWaitMinutes: round1(avgWait),
      avgServiceMinutes: round1(avgService),
      activeClinicians,
      patientToStaffRatio,
      overtimeHours,
      overtimeCostNgn: Math.round(overtimeHours * config.overtimeRateNgnPerHour),
      bedCensus: round1(census),
      bedOccupancyPct,
      isOccupancySpike: spikeSeverity !== 'normal',
      spikeSeverity,
      staffingTarget,
      staffingGap,
    };
  });

  // 7 x 24 Day-of-Week x Hour Heatmap
  const heatmapBuckets = Array.from({ length: 7 }, (_, dayIndex) =>
    Array.from({ length: 24 }, (_, hour) => ({
      dayIndex,
      dayLabel: DAY_LABELS[dayIndex],
      hour,
      count: 0,
      waitSum: 0,
      waitCount: 0,
    }))
  );

  for (const r of filteredRecords) {
    const cell = heatmapBuckets[r.dayOfWeekIndex]?.[r.arrivalHour];
    if (cell) {
      cell.count += 1;
      if (r.waitTimeMinutes !== null) {
        cell.waitSum += r.waitTimeMinutes;
        cell.waitCount += 1;
      }
    }
  }

  const heatmap: HeatmapCell[] = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const b = heatmapBuckets[d][h];
      heatmap.push({
        dayIndex: b.dayIndex,
        dayLabel: b.dayLabel,
        hour: b.hour,
        count: b.count,
        avgWaitMinutes: b.waitCount > 0 ? round1(b.waitSum / b.waitCount) : 0,
      });
    }
  }

  // Department Stats
  const deptGroups = new Map<string, HospitalRecord[]>();
  for (const r of filteredRecords) {
    const arr = deptGroups.get(r.department) ?? [];
    arr.push(r);
    deptGroups.set(r.department, arr);
  }

  const totalFiltered = Math.max(1, filteredRecords.length);
  const departmentStats: DepartmentStat[] = Array.from(deptGroups.entries())
    .map(([dept, recs]) => {
      const waits = recs.map((r) => r.waitTimeMinutes).filter((v): v is number => v !== null);
      const services = recs
        .map((r) => r.serviceDurationMinutes)
        .filter((v): v is number => v !== null);
      const losses = recs.map((r) => r.lengthOfStayDays).filter((v): v is number => v !== null);
      const sats = recs.map((r) => r.satisfactionScore).filter((v): v is number => v !== null);
      const costs = recs.map((r) => r.treatmentCostNgn).filter((v): v is number => v !== null);

      const avgWait = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : 0;
      const avgService = services.length
        ? services.reduce((a, b) => a + b, 0) / services.length
        : 0;
      const avgLos = losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
      const avgSat = sats.length ? sats.reduce((a, b) => a + b, 0) / sats.length : 0;
      const readmitCount = recs.filter((r) => r.readmittedWithin30Days).length;
      const readmitRate = (readmitCount / recs.length) * 100;
      const clinicians = new Set(recs.map((r) => r.physician)).size;

      // Average daily patient-to-clinician ratio inside department
      const deptDayGroups = new Map<string, HospitalRecord[]>();
      for (const r of recs) {
        const arr = deptDayGroups.get(r.arrivalDate) ?? [];
        arr.push(r);
        deptDayGroups.set(r.arrivalDate, arr);
      }
      let ratioSum = 0;
      for (const [, dayRecs] of deptDayGroups) {
        const dayDocs = Math.max(1, new Set(dayRecs.map((x) => x.physician)).size);
        ratioSum += dayRecs.length / dayDocs;
      }
      const avgRatio = deptDayGroups.size > 0 ? ratioSum / deptDayGroups.size : 0;

      // Overtime for department
      let otHours = 0;
      for (const r of recs) {
        if (r.directOvertimeHours !== null) {
          otHours += r.directOvertimeHours;
        } else {
          const waitEx = Math.max(0, (r.waitTimeMinutes ?? 0) - 45) * 0.012;
          const srvEx = Math.max(0, (r.serviceDurationMinutes ?? 0) - 55) * 0.018;
          const nightP = r.shift === 'Night' ? 0.65 : 0;
          otHours += waitEx + srvEx + nightP;
        }
      }

      // Composite efficiency score (0-100): rewards fast waits (<30m), high CSAT, low readmissions
      const waitScore = Math.max(0, 40 - Math.max(0, avgWait - 20) * 0.8);
      const satScore = (avgSat / 5) * 35;
      const readmitScore = Math.max(0, 25 - readmitRate * 0.9);
      const efficiencyScore = Math.min(100, Math.max(15, Math.round(waitScore + satScore + readmitScore)));

      return {
        department: dept,
        admissions: recs.length,
        sharePct: round1((recs.length / totalFiltered) * 100),
        avgWaitMinutes: round1(avgWait),
        avgServiceMinutes: round1(avgService),
        avgLosDays: round1(avgLos),
        avgSatisfaction: round2(avgSat),
        readmissionRatePct: round1(readmitRate),
        activeClinicians: clinicians,
        patientToStaffRatio: round2(avgRatio),
        estimatedOvertimeHours: round1(otHours),
        estimatedOvertimeCostNgn: Math.round(otHours * config.overtimeRateNgnPerHour),
        totalRevenueNgn: costs.reduce((a, b) => a + b, 0),
        efficiencyScore,
      };
    })
    .sort((a, b) => b.admissions - a.admissions);

  // Shift Workload Stats & Bottleneck Alerts
  const shiftWorkloads: ShiftWorkloadStat[] = [];
  const bottleneckAlerts: BottleneckAlert[] = [];

  for (const deptStat of departmentStats) {
    const deptRecs = deptGroups.get(deptStat.department) ?? [];
    for (const shift of SHIFTS) {
      const sRecs = deptRecs.filter((r) => r.shift === shift);
      if (sRecs.length === 0) continue;

      const byDay = new Map<string, HospitalRecord[]>();
      for (const r of sRecs) {
        const arr = byDay.get(r.arrivalDate) ?? [];
        arr.push(r);
        byDay.set(r.arrivalDate, arr);
      }

      let clinicianDaySum = 0;
      let ratioDaySum = 0;
      let otSum = 0;
      let understaffedDays = 0;

      for (const [d, dayRecs] of byDay) {
        const docs = Math.max(1, new Set(dayRecs.map((x) => x.physician)).size);
        const ratio = dayRecs.length / docs;
        clinicianDaySum += docs;
        ratioDaySum += ratio;

        const waits = dayRecs
          .map((x) => x.waitTimeMinutes)
          .filter((v): v is number => v !== null);
        const avgDayWait = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : 0;

        for (const r of dayRecs) {
          otSum +=
            r.directOvertimeHours ??
            Math.max(0, (r.waitTimeMinutes ?? 0) - 45) * 0.012 +
              Math.max(0, (r.serviceDurationMinutes ?? 0) - 55) * 0.018 +
              (shift === 'Night' ? 0.65 : 0);
        }

        if (ratio >= 1.5 || avgDayWait >= 60 || (shift === 'Night' && avgDayWait >= 48)) {
          understaffedDays += 1;
          bottleneckAlerts.push({
            id: `shift-${d}-${deptStat.department}-${shift}`,
            date: d,
            shift,
            department: deptStat.department,
            alertType: ratio >= 2 ? 'understaffed_shift' : 'wait_surge',
            severity: avgDayWait >= 70 || ratio >= 2 ? 'critical' : 'warning',
            metricLabel: ratio >= 2 ? 'Intake Ratio' : 'Shift Avg Wait',
            metricValue:
              ratio >= 2 ? `${round1(ratio)}:1 (${dayRecs.length} pts / ${docs} MD)` : `${round1(avgDayWait)} min`,
            thresholdValue: ratio >= 2 ? '1.5:1 intake cap' : '55 min SLA',
            recommendedAction:
              shift === 'Night'
                ? 'Activate on-call float clinician for overnight coverage'
                : `Reallocate 1 float clinician to ${deptStat.department} (${shift})`,
          });
        }
      }

      const activeDays = Math.max(1, byDay.size);
      shiftWorkloads.push({
        department: deptStat.department,
        shift,
        admissions: sRecs.length,
        avgCliniciansPerDay: round2(clinicianDaySum / activeDays),
        patientToStaffRatio: round2(ratioDaySum / activeDays),
        overtimeHours: round1(otSum),
        understaffedDays,
      });
    }
  }

  // Bed Occupancy Spike Alerts from Daily Series
  for (const day of dailySeries) {
    if (day.isOccupancySpike) {
      bottleneckAlerts.push({
        id: `bed-${day.date}`,
        date: day.date,
        shift: 'Morning',
        department: filters.department === 'ALL' ? 'Facility-Wide' : filters.department,
        alertType: 'bed_spike',
        severity: day.spikeSeverity === 'critical' ? 'critical' : 'warning',
        metricLabel: 'Bed Occupancy',
        metricValue: `${day.bedOccupancyPct}% (${day.bedCensus}/${effectiveBeds} beds)`,
        thresholdValue: `${config.occupancyWarningPct}% target`,
        recommendedAction:
          day.spikeSeverity === 'critical'
            ? 'Expedite step-down discharges & open surge overflow beds'
            : 'Pre-screen morning discharges to preserve buffer capacity',
      });
    }
  }

  // Sort bottleneck alerts: critical first, then most recent date
  bottleneckAlerts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
    return b.date.localeCompare(a.date);
  });

  // Forecasts
  const forecasts = buildForecastSeries(dailySeries, forecastHorizonDays, {
    ...config,
    totalLicensedBeds: effectiveBeds,
  });

  // Executive KPIs
  const allWaits = filteredRecords
    .map((r) => r.waitTimeMinutes)
    .filter((v): v is number => v !== null);
  const allSats = filteredRecords
    .map((r) => r.satisfactionScore)
    .filter((v): v is number => v !== null);
  const readmitCount = filteredRecords.filter((r) => r.readmittedWithin30Days).length;

  const avgWaitMinutes = allWaits.length
    ? round1(allWaits.reduce((a, b) => a + b, 0) / allWaits.length)
    : 0;
  const avgBedOccupancyPct = dailySeries.length
    ? round1(dailySeries.reduce((a, b) => a + b.bedOccupancyPct, 0) / dailySeries.length)
    : 0;
  const peakBedOccupancyPct = dailySeries.length
    ? round1(Math.max(...dailySeries.map((d) => d.bedOccupancyPct)))
    : 0;
  const occupancySpikeDays = dailySeries.filter((d) => d.isOccupancySpike).length;
  const estimatedOvertimeHours = round1(
    dailySeries.reduce((a, b) => a + b.overtimeHours, 0)
  );
  const estimatedOvertimeCostNgn = dailySeries.reduce((a, b) => a + b.overtimeCostNgn, 0);
  const activeRatioDays = dailySeries.filter((d) => d.activeClinicians > 0);
  const avgPatientToStaffRatio = activeRatioDays.length
    ? round2(
        activeRatioDays.reduce((a, b) => a + b.patientToStaffRatio, 0) /
          activeRatioDays.length
      )
    : 0;
  const avgSatisfaction = allSats.length
    ? round2(allSats.reduce((a, b) => a + b, 0) / allSats.length)
    : 0;
  const readmissionRatePct = filteredRecords.length
    ? round1((readmitCount / filteredRecords.length) * 100)
    : 0;

  const kpis = {
    totalAdmissions: filteredRecords.length,
    avgWaitMinutes,
    avgBedOccupancyPct,
    peakBedOccupancyPct,
    occupancySpikeDays,
    estimatedOvertimeHours,
    estimatedOvertimeCostNgn,
    avgPatientToStaffRatio,
    avgSatisfaction,
    readmissionRatePct,
    understaffedAlertCount: bottleneckAlerts.filter((a) => a.alertType !== 'bed_spike').length,
    dateSpanLabel:
      filteredRecords.length > 0
        ? `${formatShortDate(startBound)} – ${formatShortDate(endBound)}`
        : 'No records in filter',
  };

  // Auto-generated Narrative Insights
  const insights: NarrativeInsight[] = [];
  if (filteredRecords.length > 0) {
    const topWaitDept = [...departmentStats].sort((a, b) => b.avgWaitMinutes - a.avgWaitMinutes)[0];
    const topVolDept = departmentStats[0];
    const peakCell = [...heatmap].sort((a, b) => b.count - a.count)[0];
    const futurePoints = forecasts.filter((f) => f.isForecast);
    const avgForecastAdm = futurePoints.length
      ? round1(
          futurePoints.reduce((s, f) => s + (f.predictedAdmissions ?? 0), 0) / futurePoints.length
        )
      : 0;
    const maxForecastOcc = futurePoints.length
      ? round1(Math.max(...futurePoints.map((f) => f.predictedOccupancyPct ?? 0)))
      : 0;

    if (topVolDept) {
      insights.push({
        id: 'insight-demand-peak',
        category: 'demand',
        severity: 'info',
        title: `${topVolDept.department} leads demand at ${topVolDept.sharePct}% of total volume`,
        summary: `Across ${filteredRecords.length.toLocaleString()} encounters, ${topVolDept.department} recorded ${topVolDept.admissions} admissions (${topVolDept.avgWaitMinutes} min avg wait). Peak intake concentrates on ${peakCell?.dayLabel ?? 'Weekdays'} around ${String(peakCell?.hour ?? 10).padStart(2, '0')}:00.`,
        recommendation: `Align triage nurse intake schedules 60 minutes prior to the ${peakCell?.dayLabel ?? 'peak'} ${String(peakCell?.hour ?? 10).padStart(2, '0')}:00 arrival window.`,
      });
    }

    if (topWaitDept) {
      insights.push({
        id: 'insight-wait-bottleneck',
        category: 'efficiency',
        severity: topWaitDept.avgWaitMinutes >= 45 ? 'warning' : 'info',
        title: `Longest clinical wait times observed in ${topWaitDept.department} (${topWaitDept.avgWaitMinutes} min)`,
        summary: `${topWaitDept.department} averages ${topWaitDept.avgWaitMinutes} minutes wait against a hospital-wide average of ${avgWaitMinutes} minutes, with an efficiency score of ${topWaitDept.efficiencyScore}/100 and ${topWaitDept.readmissionRatePct}% 30-day readmissions.`,
        recommendation: `Audit ${topWaitDept.department} triage-to-clinician handoff during Afternoon shifts and expand fast-track rooming.`,
      });
    }

    insights.push({
      id: 'insight-bed-forecast',
      category: 'bottleneck',
      severity: peakBedOccupancyPct >= config.occupancyCriticalPct ? 'critical' : 'warning',
      title: `${occupancySpikeDays} occupancy spike days recorded (peak ${peakBedOccupancyPct}%)`,
      summary: `Estimated bed utilization averaged ${avgBedOccupancyPct}% against ${effectiveBeds} allocated beds, peaking at ${peakBedOccupancyPct}%. ${futurePoints.length}-day projections estimate ${avgForecastAdm} admissions/day and up to ${maxForecastOcc}% occupancy.`,
      recommendation:
        maxForecastOcc >= config.occupancyWarningPct
          ? 'Trigger early-discharge rounding protocol and reserve flex overflow beds before projected surge windows.'
          : 'Maintain baseline inpatient discharge cadence; buffer capacity remains within safe thresholds.',
    });

    const topOtDept = [...departmentStats].sort(
      (a, b) => b.estimatedOvertimeHours - a.estimatedOvertimeHours
    )[0];
    if (topOtDept) {
      insights.push({
        id: 'insight-overtime-cost',
        category: 'workload',
        severity: kpis.understaffedAlertCount > 10 ? 'warning' : 'info',
        title: `Estimated ₦${(estimatedOvertimeCostNgn / 1000).toFixed(0)}k overtime exposure (${estimatedOvertimeHours} hrs)`,
        summary: `${topOtDept.department} accounts for ${topOtDept.estimatedOvertimeHours} derived workload/overtime hours (₦${topOtDept.estimatedOvertimeCostNgn.toLocaleString()}). System flagged ${kpis.understaffedAlertCount} shift-level staffing pressure windows.`,
        recommendation: `Cross-train float staff for ${topOtDept.department} high-load days to reduce overtime burn by an estimated 15–20%.`,
      });
    }
  }

  return {
    kpis,
    dailySeries,
    heatmap,
    departmentStats,
    shiftWorkloads,
    bottleneckAlerts,
    forecasts,
    insights,
    availableDepartments,
    minDate,
    maxDate,
    usedDirectStaffColumn,
    usedDirectOccupancyColumn,
    usedDirectOvertimeColumn,
  };
}

/**
 * Serializes compact, exact analytics metrics for the server-side Gemini AI chatbot
 * so every LLM response is strictly grounded in computed numbers (zero fabricated figures).
 */
export function buildAiAnalyticsContext(
  summary: AnalyticsSummary,
  filters: FilterState,
  config: CapacityConfig,
  totalDatasetRows: number,
  forecastHorizonDays: number
): string {
  const future = summary.forecasts.filter((f) => f.isForecast);
  const avgProjAdm = future.length
    ? round1(future.reduce((s, f) => s + (f.predictedAdmissions ?? 0), 0) / future.length)
    : 0;
  const avgProjOcc = future.length
    ? round1(future.reduce((s, f) => s + (f.predictedOccupancyPct ?? 0), 0) / future.length)
    : 0;
  const maxProjOcc = future.length
    ? round1(Math.max(...future.map((f) => f.predictedOccupancyPct ?? 0)))
    : 0;
  const avgProjStaff = future.length
    ? round1(future.reduce((s, f) => s + (f.predictedStaffNeeded ?? 0), 0) / future.length)
    : 0;

  // Monthly breakdown
  const monthly = new Map<string, { count: number; waitSum: number; otSum: number; occSum: number; days: number }>();
  for (const d of summary.dailySeries) {
    const ym = d.date.slice(0, 7);
    const cur = monthly.get(ym) ?? { count: 0, waitSum: 0, otSum: 0, occSum: 0, days: 0 };
    cur.count += d.admissions;
    cur.waitSum += d.avgWaitMinutes * d.admissions;
    cur.otSum += d.overtimeHours;
    cur.occSum += d.bedOccupancyPct;
    cur.days += 1;
    monthly.set(ym, cur);
  }

  const peakHeatmap = [...summary.heatmap].sort((a, b) => b.count - a.count).slice(0, 5);

  return JSON.stringify({
    datasetMeta: {
      totalLoadedRows: totalDatasetRows,
      filteredRows: summary.kpis.totalAdmissions,
      activeFilters: filters,
      dateSpan: summary.kpis.dateSpanLabel,
      availableDepartments: summary.availableDepartments,
      capacityAssumptions: config,
      derivedNotes: {
        staffSource: summary.usedDirectStaffColumn ? 'Direct CSV column' : 'Derived from distinct AttendingPhysician per shift/day',
        occupancySource: summary.usedDirectOccupancyColumn ? 'Direct CSV column' : 'Derived from inpatient LOS daily bed census vs TotalLicensedBeds',
        overtimeSource: summary.usedDirectOvertimeColumn ? 'Direct CSV column' : 'Derived from wait/service overruns, night shifts, and staffing gaps',
      },
      availableFields: [
        'Department', 'AttendingPhysician', 'ArrivalDate', 'ArrivalTime', 'DayOfWeek',
        'WaitTime_Minutes', 'ServiceDuration_Minutes', 'DischargeDate', 'LengthOfStay_Days',
        'DiagnosisCategory', 'InsuranceType', 'TreatmentCost_NGN', 'ReadmittedWithin30Days',
        'PatientSatisfactionScore', 'DischargeStatus',
      ],
    },
    kpis: summary.kpis,
    departments: summary.departmentStats,
    monthlySummary: Array.from(monthly.entries()).map(([month, m]) => ({
      month,
      admissions: m.count,
      avgWaitMinutes: m.count > 0 ? round1(m.waitSum / m.count) : 0,
      avgOccupancyPct: m.days > 0 ? round1(m.occSum / m.days) : 0,
      overtimeHours: round1(m.otSum),
    })),
    topArrivalPeakWindows: peakHeatmap.map((c) => ({
      day: c.dayLabel,
      hour: `${String(c.hour).padStart(2, '0')}:00`,
      admissions: c.count,
      avgWaitMinutes: c.avgWaitMinutes,
    })),
    topBottleneckAlerts: summary.bottleneckAlerts.slice(0, 12),
    activeForecast: {
      horizonDays: forecastHorizonDays,
      model: 'Linear trend + Day-of-Week seasonality (90% prediction band, labeled as estimate)',
      avgProjectedDailyAdmissions: avgProjAdm,
      avgProjectedOccupancyPct: avgProjOcc,
      peakProjectedOccupancyPct: maxProjOcc,
      avgProjectedStaffNeededPerDay: avgProjStaff,
      sampleFirst3Days: future.slice(0, 3),
    },
  });
}
