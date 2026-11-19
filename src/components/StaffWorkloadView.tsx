import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Award, Clock, ShieldAlert, Users } from 'lucide-react';
import type { AnalyticsSummary, CapacityConfig } from '../types/hospital';
import { SectionHeader } from './SectionHeader';

interface StaffWorkloadViewProps {
  summary: AnalyticsSummary;
  config: CapacityConfig;
}

export function StaffWorkloadView({ summary, config }: StaffWorkloadViewProps) {
  const { dailySeries, departmentStats, shiftWorkloads, kpis } = summary;

  // Group daily series weekly if > 65 days for readable overlay & ratio lines
  const seriesData = useMemo(() => {
    if (dailySeries.length <= 65) return dailySeries;
    const buckets: {
      label: string;
      patientToStaffRatio: number;
      activeClinicians: number;
      staffingTarget: number;
      admissions: number;
    }[] = [];
    for (let i = 0; i < dailySeries.length; i += 7) {
      const slice = dailySeries.slice(i, i + 7);
      const len = slice.length || 1;
      buckets.push({
        label: slice[0].label,
        patientToStaffRatio:
          Math.round((slice.reduce((s, d) => s + d.patientToStaffRatio, 0) / len) * 100) / 100,
        activeClinicians:
          Math.round((slice.reduce((s, d) => s + d.activeClinicians, 0) / len) * 10) / 10,
        staffingTarget:
          Math.round((slice.reduce((s, d) => s + d.staffingTarget, 0) / len) * 10) / 10,
        admissions: slice.reduce((s, d) => s + d.admissions, 0),
      });
    }
    return buckets;
  }, [dailySeries]);

  // Overtime by Department x Shift stacked/grouped
  const overtimeByDeptShift = useMemo(() => {
    return departmentStats.map((dept) => {
      const findOt = (shift: 'Morning' | 'Afternoon' | 'Night') =>
        shiftWorkloads.find((s) => s.department === dept.department && s.shift === shift)
          ?.overtimeHours ?? 0;
      return {
        department: dept.department,
        Morning: findOt('Morning'),
        Afternoon: findOt('Afternoon'),
        Night: findOt('Night'),
      };
    });
  }, [departmentStats, shiftWorkloads]);

  const topEfficiencyDept = [...departmentStats].sort(
    (a, b) => b.efficiencyScore - a.efficiencyScore
  )[0];

  const cards = [
    {
      bg: '#02808F',
      icon: Users,
      title: 'Patient-to-Clinician Ratio',
      value: `${kpis.avgPatientToStaffRatio}:1`,
      note: `Target ceiling ${config.targetPatientsPerClinician}:1 active load`,
    },
    {
      bg: '#00A795',
      icon: Clock,
      title: 'Estimated Overtime Load',
      value: `${kpis.estimatedOvertimeHours.toLocaleString()} hrs`,
      note: summary.usedDirectOvertimeColumn
        ? 'Computed from uploaded overtime column'
        : 'Derived from triage/service overruns & night coverage',
    },
    {
      bg: '#02808F',
      icon: ShieldAlert,
      title: 'Understaffed Shift Windows',
      value: `${kpis.understaffedAlertCount} Flags`,
      note: 'Shifts exceeding intake ratio or 55m wait SLA',
    },
    {
      bg: '#00A795',
      icon: Award,
      title: 'Top Efficiency Unit',
      value: topEfficiencyDept ? `${topEfficiencyDept.department}` : 'N/A',
      note: topEfficiencyDept
        ? `Score ${topEfficiencyDept.efficiencyScore}/100 (${topEfficiencyDept.avgWaitMinutes}m wait)`
        : '',
    },
  ];

  return (
    <section aria-labelledby="section-workload-heading" className="space-y-10">
      <SectionHeader
        number="02"
        title="Staff Workload & Operational Efficiency"
        subtitle="Active patient-to-clinician ratios, shift overtime exposure, daily staffing coverage vs. demand, and unit efficiency scorecards"
      />

      {/* 4 Alternating Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => {
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

      {/* Row 1: Patient-to-Staff Ratio Trend & Staffing vs Demand Overlay */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="rounded-md border border-[#E5E7EB] bg-white p-6">
          <h3 className="font-editorial-serif text-xl font-bold text-[#1B1B2F]">
            Patient-to-Clinician Ratio Trend
          </h3>
          <p className="mb-4 text-xs italic text-[#6B7280]">
            Active inpatient + intake load per clinician vs. {config.targetPatientsPerClinician}:1 target threshold
          </p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={seriesData} margin={{ top: 10, right: 16, left: -12, bottom: 0 }}>
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
                <ReferenceLine
                  y={config.targetPatientsPerClinician}
                  stroke="#0A2E36"
                  strokeDasharray="4 4"
                  label={{
                    value: `Target (${config.targetPatientsPerClinician}:1)`,
                    fill: '#0A2E36',
                    fontSize: 11,
                    position: 'insideTopRight',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="patientToStaffRatio"
                  name="Patients / Clinician"
                  stroke="#02808F"
                  strokeWidth={2.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-md border border-[#E5E7EB] bg-white p-6">
          <h3 className="font-editorial-serif text-xl font-bold text-[#1B1B2F]">
            Staffing Coverage vs. Target Demand
          </h3>
          <p className="mb-4 text-xs italic text-[#6B7280]">
            Scheduled active clinicians compared against load-required staffing target
          </p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={seriesData} margin={{ top: 10, right: 16, left: -12, bottom: 0 }}>
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
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar
                  dataKey="activeClinicians"
                  name="Active Clinicians"
                  fill="#00A795"
                  radius={[3, 3, 0, 0]}
                />
                <Line
                  type="monotone"
                  dataKey="staffingTarget"
                  name="Demand-Required Staff"
                  stroke="#0A2E36"
                  strokeWidth={2.2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row 2: Overtime Hours by Dept & Shift + Efficiency Scorecards */}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
        <div className="rounded-md border border-[#E5E7EB] bg-white p-6 xl:col-span-6">
          <h3 className="font-editorial-serif text-xl font-bold text-[#1B1B2F]">
            Overtime Hours by Department & Shift
          </h3>
          <p className="mb-4 text-xs italic text-[#6B7280]">
            Morning (07–14), Afternoon (14–21), and Night (21–07) workload hours
          </p>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={overtimeByDeptShift}
                margin={{ top: 10, right: 16, left: -12, bottom: 32 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="department"
                  tick={{ fill: '#1B1B2F', fontSize: 11 }}
                  angle={-25}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} unit="h" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0A2E36',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#FFFFFF',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                <Bar dataKey="Morning" stackId="ot" fill="#00A795" />
                <Bar dataKey="Afternoon" stackId="ot" fill="#02808F" />
                <Bar dataKey="Night" stackId="ot" fill="#0A2E36" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-md border border-[#E5E7EB] bg-white p-6 xl:col-span-6">
          <h3 className="font-editorial-serif text-xl font-bold text-[#1B1B2F]">
            Department Efficiency Scorecards
          </h3>
          <p className="mb-4 text-xs italic text-[#6B7280]">
            Composite score weighting wait speed, CSAT rating, and 30-day readmission control
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-[#0A2E36] text-xs font-semibold tracking-wider text-white uppercase">
                  <th className="px-3 py-2.5">Department</th>
                  <th className="px-3 py-2.5 text-right">Clinicians</th>
                  <th className="px-3 py-2.5 text-right">OT Hrs</th>
                  <th className="px-3 py-2.5 text-right">CSAT</th>
                  <th className="px-3 py-2.5 text-right">Readmit</th>
                  <th className="px-3 py-2.5 text-right">Efficiency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {departmentStats.map((d) => (
                  <tr key={d.department} className="hover:bg-[#F8FAFC]">
                    <td className="px-3 py-2.5 font-medium text-[#1B1B2F]">{d.department}</td>
                    <td className="font-tabular px-3 py-2.5 text-right text-[#6B7280]">
                      {d.activeClinicians}
                    </td>
                    <td className="font-tabular px-3 py-2.5 text-right text-[#1B1B2F]">
                      {d.estimatedOvertimeHours}h
                    </td>
                    <td className="font-tabular px-3 py-2.5 text-right text-[#6B7280]">
                      {d.avgSatisfaction}/5
                    </td>
                    <td className="font-tabular px-3 py-2.5 text-right text-[#6B7280]">
                      {d.readmissionRatePct}%
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <div className="h-2 w-16 overflow-hidden rounded-xs bg-[#E5E7EB]">
                          <div
                            style={{
                              width: `${d.efficiencyScore}%`,
                              backgroundColor: d.efficiencyScore >= 70 ? '#00A795' : '#02808F',
                            }}
                            className="h-full"
                          />
                        </div>
                        <span className="font-tabular font-semibold text-[#0A2E36]">
                          {d.efficiencyScore}
                        </span>
                      </div>
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
