import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  autoDetectColumnMapping,
  normalizeHospitalRecords,
  parseCsvText,
} from './csvParser';
import {
  buildAiAnalyticsContext,
  buildForecastSeries,
  computeHospitalAnalytics,
  DEFAULT_CAPACITY_CONFIG,
} from './analyticsEngine';

test('autoDetectColumnMapping identifies standard hospital CSV columns', () => {
  const headers = [
    'PatientID',
    'PatientName',
    'Department',
    'AttendingPhysician',
    'ArrivalDate',
    'ArrivalTime',
    'WaitTime_Minutes',
    'ServiceDuration_Minutes',
    'DischargeDate',
    'LengthOfStay_Days',
    'TreatmentCost_NGN',
    'PatientSatisfactionScore',
    'ReadmittedWithin30Days',
    'DischargeStatus',
    'DiagnosisCategory',
  ];
  const mapping = autoDetectColumnMapping(headers);
  assert.equal(mapping.patientId, 'PatientID');
  assert.equal(mapping.department, 'Department');
  assert.equal(mapping.arrivalDate, 'ArrivalDate');
  assert.equal(mapping.waitTime, 'WaitTime_Minutes');
  assert.equal(mapping.physician, 'AttendingPhysician');
});

test('normalizeHospitalRecords skips malformed rows and clamps negative waits safely', () => {
  const messyCsv = [
    'PatientID,Department,ArrivalDate,ArrivalTime,WaitTime_Minutes,ServiceDuration_Minutes,LengthOfStay_Days,AttendingPhysician',
    'PT-1,Emergency,2025-03-10,08:15,25,40,2,Dr. Bello',
    'PT-2,,2025-03-10,09:00,15,30,1,Dr. Bello', // missing dept -> skipped
    'PT-3,Cardiology,bad-date,10:00,20,30,1,Dr. Musa', // bad date -> skipped
    'PT-4,Pediatrics,2025-03-11,22:30,-10,50,0,Dr. Okafor', // negative wait -> nulled, 0-day LOS counted
  ].join('\n');

  const { headers, rawRows } = parseCsvText(messyCsv);
  const mapping = autoDetectColumnMapping(headers);
  const { records, qualityReport } = normalizeHospitalRecords(rawRows, mapping);

  assert.equal(qualityReport.totalRawRows, 4);
  assert.equal(qualityReport.validRows, 2);
  assert.equal(qualityReport.skippedRows, 2);
  assert.equal(qualityReport.sameDayZeroLosCount, 1);
  assert.equal(records[0].shift, 'Morning');
  assert.equal(records[1].shift, 'Night');
  assert.equal(records[1].waitTimeMinutes, null);
});

test('full hospital_admissions.csv parses 1097 records and computes consistent analytics', () => {
  const csvPath = path.resolve(process.cwd(), 'public/data/hospital_admissions.csv');
  const csvText = fs.readFileSync(csvPath, 'utf8');
  const { headers, rawRows } = parseCsvText(csvText);
  const mapping = autoDetectColumnMapping(headers);
  const { records, qualityReport } = normalizeHospitalRecords(rawRows, mapping);

  assert.equal(records.length, 1097);
  assert.equal(qualityReport.skippedRows, 0);

  const summary = computeHospitalAnalytics(
    records,
    { startDate: '2025-01-01', endDate: '2025-12-31', department: 'ALL' },
    DEFAULT_CAPACITY_CONFIG,
    14
  );

  assert.equal(summary.kpis.totalAdmissions, 1097);
  assert.equal(summary.availableDepartments.length, 10);
  assert.equal(summary.heatmap.length, 7 * 24);

  const heatmapTotal = summary.heatmap.reduce((acc, cell) => acc + cell.count, 0);
  assert.equal(heatmapTotal, 1097);

  const deptAdmissionsSum = summary.departmentStats.reduce((acc, d) => acc + d.admissions, 0);
  assert.equal(deptAdmissionsSum, 1097);

  assert.ok(summary.kpis.avgWaitMinutes > 20 && summary.kpis.avgWaitMinutes < 80);
  assert.ok(summary.kpis.occupancySpikeDays > 0, 'Expected occupancy spikes under 16-bed baseline');
  assert.ok(summary.bottleneckAlerts.length > 0, 'Expected actionable bottleneck alerts');
  assert.ok(summary.insights.length >= 3, 'Expected auto-generated narrative insights');
});

test('department & date filtering isolates target records and recalculates KPIs', () => {
  const csvPath = path.resolve(process.cwd(), 'public/data/hospital_admissions.csv');
  const csvText = fs.readFileSync(csvPath, 'utf8');
  const { headers, rawRows } = parseCsvText(csvText);
  const { records } = normalizeHospitalRecords(rawRows, autoDetectColumnMapping(headers));

  const q1Emergency = computeHospitalAnalytics(
    records,
    { startDate: '2025-01-01', endDate: '2025-03-31', department: 'Emergency' },
    DEFAULT_CAPACITY_CONFIG,
    21
  );

  assert.ok(q1Emergency.kpis.totalAdmissions > 0 && q1Emergency.kpis.totalAdmissions < 150);
  assert.equal(q1Emergency.departmentStats.length, 1);
  assert.equal(q1Emergency.departmentStats[0].department, 'Emergency');

  const forecastPoints = q1Emergency.forecasts.filter((f) => f.isForecast);
  assert.equal(forecastPoints.length, 21);
});

test('buildForecastSeries enforces 7-30 day horizon and valid prediction intervals', () => {
  const csvPath = path.resolve(process.cwd(), 'public/data/hospital_admissions.csv');
  const csvText = fs.readFileSync(csvPath, 'utf8');
  const { headers, rawRows } = parseCsvText(csvText);
  const { records } = normalizeHospitalRecords(rawRows, autoDetectColumnMapping(headers));

  const summary = computeHospitalAnalytics(
    records,
    { startDate: '2025-01-01', endDate: '2025-12-31', department: 'ALL' },
    DEFAULT_CAPACITY_CONFIG,
    14
  );

  const f7 = buildForecastSeries(summary.dailySeries, 3, DEFAULT_CAPACITY_CONFIG).filter(
    (p) => p.isForecast
  );
  const f30 = buildForecastSeries(summary.dailySeries, 45, DEFAULT_CAPACITY_CONFIG).filter(
    (p) => p.isForecast
  );

  assert.equal(f7.length, 7);
  assert.equal(f30.length, 30);

  for (const pt of f30) {
    assert.ok((pt.admissionsLower ?? 0) <= (pt.predictedAdmissions ?? 0));
    assert.ok((pt.predictedAdmissions ?? 0) <= (pt.admissionsUpper ?? 0));
    assert.ok((pt.occupancyLowerPct ?? 0) <= (pt.predictedOccupancyPct ?? 0));
    assert.ok((pt.predictedOccupancyPct ?? 0) <= (pt.occupancyUpperPct ?? 0));
    assert.ok((pt.predictedStaffNeeded ?? 0) >= 1);
  }

  const aiJson = buildAiAnalyticsContext(
    summary,
    { startDate: '2025-01-01', endDate: '2025-12-31', department: 'ALL' },
    DEFAULT_CAPACITY_CONFIG,
    records.length,
    14
  );
  const parsed = JSON.parse(aiJson);
  assert.equal(parsed.datasetMeta.totalLoadedRows, 1097);
  assert.equal(parsed.activeForecast.horizonDays, 14);
});
